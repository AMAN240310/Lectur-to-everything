"""Background processing pipeline: transcribe -> filter -> extract -> persist.

Idempotency: every artifact is written with an upsert keyed on (lecture_id[, key]) and backed by
a unique index, so retries and reprocessing never create duplicate records. User decisions
(flashcard progress, confirmed assignments, restored transcript segments) survive regeneration.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any
from weakref import WeakKeyDictionary

from .config import get_settings
from .db import get_db
from .services import audio, extraction, filtering, transcription
from .utils import key_for, new_id, now

log = logging.getLogger(__name__)

ACTIVE = ("queued", "transcribing", "filtering", "extracting")

_semaphores: "WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore]" = WeakKeyDictionary()


def _semaphore() -> asyncio.Semaphore:
    """One lecture is processed at a time: Whisper and Gemma both need most of the machine."""
    loop = asyncio.get_running_loop()
    sem = _semaphores.get(loop)
    if sem is None:
        sem = _semaphores[loop] = asyncio.Semaphore(1)
    return sem


class PipelineError(Exception):
    pass


# ----------------------------------------------------------------------------- status helpers


async def mark_queued(db: Any, lecture_id: str, mode: str) -> None:
    await db["lectures"].update_one(
        {"_id": lecture_id},
        {
            "$set": {"status": "queued", "progress": 0, "stage_detail": "Waiting in queue", "error": None,
                     "failed_stage": None, "updated_at": now()},
            "$inc": {"attempts": 1},
            "$push": {"history": {"stage": "queued", "message": f"Queued ({mode})", "at": now()}},
        },
    )


async def _stage(db: Any, lecture_id: str, status: str, detail: str, progress: float) -> None:
    await db["lectures"].update_one(
        {"_id": lecture_id},
        {
            "$set": {"status": status, "stage_detail": detail, "progress": progress, "updated_at": now()},
            "$push": {"history": {"stage": status, "message": detail, "at": now()}},
        },
    )


async def _progress(db: Any, lecture_id: str, progress: float, detail: str) -> None:
    await db["lectures"].update_one(
        {"_id": lecture_id}, {"$set": {"progress": round(progress, 1), "stage_detail": detail, "updated_at": now()}}
    )


def _ranged(db: Any, lecture_id: str, low: float, high: float):
    async def cb(fraction: float, detail: str) -> None:
        await _progress(db, lecture_id, low + (high - low) * fraction, detail)

    return cb


async def recover_interrupted(db: Any) -> None:
    """After a crash/restart nothing is actually processing; surface that instead of spinning forever."""
    await db["lectures"].update_many(
        {"status": {"$in": list(ACTIVE)}},
        {"$set": {"status": "failed", "error": "Processing was interrupted by a restart. Use Reprocess to retry.",
                  "updated_at": now()}},
    )


# ----------------------------------------------------------------------------- pipeline


async def run_pipeline(lecture_id: str, mode: str = "full") -> None:
    db = get_db()
    s = get_settings()
    async with _semaphore():
        lec = await db["lectures"].find_one({"_id": lecture_id})
        if lec is None:
            return
        stage = "queued"
        warnings: list[str] = []
        try:
            course = await db["courses"].find_one({"_id": lec["course_id"]}) or {}
            ctx = {
                "title": lec["title"], "subject": lec.get("subject", ""), "course": course.get("name", ""),
                "date": lec.get("date", ""),
            }

            if mode == "full":
                stage = "transcribing"
                await _stage(db, lecture_id, stage, "Preparing audio", 3)
                src = s.storage_dir / lec["audio_path"]
                if not src.exists():
                    raise PipelineError("The audio file is missing from storage.")
                probed = await asyncio.to_thread(audio.probe_duration, src)
                wav = await asyncio.to_thread(audio.prepare_wav, src, s.tmp_dir)
                await _progress(db, lecture_id, 8, "Transcribing with Whisper (long lectures can take a while)")
                try:
                    hint = " ".join(p for p in (lec["title"], lec.get("subject", "")) if p)
                    result = await asyncio.to_thread(
                        transcription.transcribe_file, str(wav), lec.get("language_hint", "auto"), hint
                    )
                finally:
                    if wav != src and wav.parent == s.tmp_dir:
                        wav.unlink(missing_ok=True)
                await _save_transcript(db, lec, result, probed)

            transcript = await db["transcripts"].find_one({"lecture_id": lecture_id})
            if not transcript or not transcript.get("segments"):
                raise PipelineError("No speech was recognised in this recording.")
            segments = transcript["segments"]

            if mode in ("full", "content"):
                stage = "filtering"
                await _stage(db, lecture_id, stage, "Filtering non-academic conversation", 30)
                segments, w = await filtering.classify_segments(
                    segments, ctx["subject"] or ctx["course"], _ranged(db, lecture_id, 30, 50)
                )
                warnings += w
                await db["transcripts"].update_one(
                    {"lecture_id": lecture_id}, {"$set": {"segments": segments, "updated_at": now()}}
                )

            stage = "extracting"
            await _stage(db, lecture_id, stage, "Extracting study material with Gemma", 50)
            materials, w = await extraction.extract_all(segments, ctx, _ranged(db, lecture_id, 50, 92))
            warnings += w

            await _progress(db, lecture_id, 94, "Saving results")
            await _save_outputs(db, lec, materials)

            await db["lectures"].update_one(
                {"_id": lecture_id},
                {
                    "$set": {"status": "completed", "progress": 100, "stage_detail": "Done", "error": None,
                             "failed_stage": None, "materials_stale": False, "warnings": warnings,
                             "processed_at": now(), "updated_at": now()},
                    "$push": {"history": {"stage": "completed", "message": "Processing finished", "at": now()}},
                },
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - everything must end up recorded on the lecture
            log.exception("Pipeline failed for lecture %s at stage %s", lecture_id, stage)
            message = str(exc) or exc.__class__.__name__
            await db["lectures"].update_one(
                {"_id": lecture_id},
                {
                    "$set": {"status": "failed", "error": message[:600], "failed_stage": stage,
                             "warnings": warnings, "updated_at": now()},
                    "$push": {"history": {"stage": "failed", "message": message[:300], "at": now()}},
                },
            )


# ----------------------------------------------------------------------------- persistence


async def _save_transcript(db: Any, lec: dict, result: dict, probed_duration: float | None) -> None:
    segments = [
        {
            "idx": i, "start": seg["start"], "end": seg["end"], "text": seg["text"],
            "original_text": seg["text"], "confidence": seg.get("confidence"),
            "category": "academic", "excluded": False, "reason": "", "edited": False, "user_override": False,
        }
        for i, seg in enumerate(result["segments"])
    ]
    await db["transcripts"].update_one(
        {"lecture_id": lec["_id"]},
        {
            "$set": {"course_id": lec["course_id"], "language": result.get("language"), "segments": segments,
                     "updated_at": now()},
            "$setOnInsert": {"_id": new_id(), "created_at": now()},
        },
        upsert=True,
    )
    await db["lectures"].update_one(
        {"_id": lec["_id"]},
        {"$set": {"detected_language": result.get("language"),
                  "duration_sec": probed_duration or result.get("duration"), "updated_at": now()}},
    )


async def _save_outputs(db: Any, lec: dict, materials: dict) -> None:
    lid, cid = lec["_id"], lec["course_id"]
    assignments = materials.pop("assignments", [])

    await db["studyMaterials"].update_one(
        {"lecture_id": lid},
        {
            "$set": {**materials, "course_id": cid, "model": get_settings().ollama_model, "updated_at": now()},
            "$setOnInsert": {"_id": new_id(), "created_at": now()},
        },
        upsert=True,
    )

    # Flashcards: refresh content, keep review progress, drop stale never-reviewed cards.
    cards = extraction.build_flashcards(materials)
    for card in cards:
        key = card.pop("key")
        await db["flashcards"].update_one(
            {"lecture_id": lid, "key": key},
            {
                "$set": {**card, "course_id": cid, "updated_at": now()},
                "$setOnInsert": {"_id": new_id(), "status": "new", "box": 0, "review_count": 0,
                                 "last_reviewed": None, "next_review": None, "created_at": now()},
            },
            upsert=True,
        )
    await db["flashcards"].delete_many(
        {"lecture_id": lid, "key": {"$nin": [key_for(c["question"]) for c in cards]}, "review_count": 0}
    )

    # Assignments: never overwrite what the user has edited; drop stale unreviewed suggestions.
    keys = []
    for a in assignments:
        key = a["key"]
        keys.append(key)
        existing = await db["assignments"].find_one({"lecture_id": lid, "key": key})
        fields = {"start": a["start"], "evidence": a["evidence"], "verified": a["verified"], "updated_at": now()}
        if existing is None or not existing.get("user_edited"):
            fields.update(title=a["title"], description=a["description"], kind=a["kind"],
                          deadline_text=a["deadline_text"], due_date=a["due_date"])
        await db["assignments"].update_one(
            {"lecture_id": lid, "key": key},
            {
                "$set": {**fields, "course_id": cid, "source": "ai"},
                "$setOnInsert": {"_id": new_id(), "status": "suggested", "user_edited": False, "created_at": now()},
            },
            upsert=True,
        )
    await db["assignments"].delete_many(
        {"lecture_id": lid, "source": "ai", "status": "suggested", "key": {"$nin": keys}}
    )
