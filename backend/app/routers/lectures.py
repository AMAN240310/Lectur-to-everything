from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import date
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pymongo.errors import DuplicateKeyError

from .. import worker
from ..config import get_settings
from ..db import get_db
from ..schemas import ReprocessIn, SegmentPatch
from ..services import pdf
from ..utils import clean, new_id, now, slugify, today_iso

router = APIRouter(prefix="/lectures", tags=["lectures"])

ALLOWED = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4"}
LANG_RE = re.compile(r"^(auto|hinglish|[a-z]{2,3})$")


async def _get(lecture_id: str) -> dict:
    lec = await get_db()["lectures"].find_one({"_id": lecture_id})
    if not lec:
        raise HTTPException(404, "Lecture not found.")
    return lec


async def delete_lecture_data(db, lec: dict) -> None:
    lid = lec["_id"]
    for name in ("transcripts", "studyMaterials", "flashcards", "assignments"):
        await db[name].delete_many({"lecture_id": lid})
    await db["lectures"].delete_one({"_id": lid})
    s = get_settings()
    (s.storage_dir / lec.get("audio_path", "")).unlink(missing_ok=True)
    (s.pdf_dir / f"{lid}.pdf").unlink(missing_ok=True)


# ------------------------------------------------------------------------------ FR-01


@router.post("", status_code=201)
async def upload_lecture(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    course_id: str = Form(...),
    subject: str = Form(""),
    lecture_date: str = Form("", alias="date"),
    description: str = Form(""),
    language: str = Form("auto"),
):
    db, s = get_db(), get_settings()
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(415, "Unsupported file type. Upload an MP3, WAV or M4A recording.")
    title = title.strip()
    if not title:
        raise HTTPException(422, "Please enter a lecture title.")
    if not LANG_RE.match(language):
        raise HTTPException(422, "Language must be 'auto', 'hinglish' or a Whisper language code such as 'en' or 'hi'.")
    if not await db["courses"].find_one({"_id": course_id}):
        raise HTTPException(404, "Course not found.")
    if lecture_date:
        try:
            # Store the parsed value, not the string the client sent: fromisoformat
            # also accepts the basic "20261027" form, and every reader of the field
            # (sorting, the frontend, the weekday line in extraction.py) expects
            # YYYY-MM-DD.
            lecture_date = date.fromisoformat(lecture_date).isoformat()
        except ValueError:
            raise HTTPException(422, "Date must be in YYYY-MM-DD format.")
    else:
        lecture_date = today_iso()

    s.ensure_dirs()
    lid = new_id()
    rel = f"audio/{lid}{ext}"
    dest = s.storage_dir / rel
    digest, size, limit = hashlib.sha256(), 0, s.max_upload_mb * 1024 * 1024
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"File is larger than the {s.max_upload_mb} MB limit.")
                digest.update(chunk)
                out.write(chunk)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(422, "The uploaded file is empty.")

    sha = digest.hexdigest()
    dup = await db["lectures"].find_one({"course_id": course_id, "audio_sha256": sha})
    if dup:
        dest.unlink(missing_ok=True)
        raise HTTPException(409, {"message": f"This recording was already uploaded as “{dup['title']}”.", "lecture_id": dup["_id"]})

    doc = {
        "_id": lid, "title": title, "course_id": course_id, "subject": subject.strip(), "date": lecture_date,
        "description": description.strip(), "language_hint": language, "original_filename": file.filename,
        "audio_path": rel, "audio_ext": ext, "audio_sha256": sha, "size_bytes": size, "duration_sec": None,
        "detected_language": None, "status": "queued", "progress": 0, "stage_detail": "Waiting in queue",
        "error": None, "failed_stage": None, "warnings": [], "materials_stale": False, "attempts": 1,
        "history": [{"stage": "uploaded", "message": f"Uploaded {file.filename}", "at": now()},
                    {"stage": "queued", "message": "Queued (full)", "at": now()}],
        "created_at": now(), "updated_at": now(), "processed_at": None,
    }
    try:
        await db["lectures"].insert_one(doc)
    except DuplicateKeyError:
        dest.unlink(missing_ok=True)
        raise HTTPException(409, "This recording was already uploaded to this course.")
    background.add_task(worker.run_pipeline, lid, "full")
    return clean(doc)


@router.get("")
async def list_lectures(course_id: str | None = None, status: str | None = None):
    db = get_db()
    query: dict = {}
    if course_id:
        query["course_id"] = course_id
    if status:
        query["status"] = status
    lectures = await db["lectures"].find(query).sort("created_at", -1).to_list(2000)
    names = {c["_id"]: c["name"] for c in await db["courses"].find({}).to_list(1000)}
    out = []
    for lec in lectures:
        item = clean(lec)
        item["course_name"] = names.get(lec["course_id"], "")
        item.pop("history", None)
        out.append(item)
    return out


@router.get("/{lecture_id}")
async def get_lecture(lecture_id: str):
    db = get_db()
    lec = await _get(lecture_id)
    course = await db["courses"].find_one({"_id": lec["course_id"]})
    out = clean(lec)
    out["course_name"] = (course or {}).get("name", "")
    return out


@router.delete("/{lecture_id}", status_code=204)
async def delete_lecture(lecture_id: str):
    lec = await _get(lecture_id)
    if lec["status"] in worker.ACTIVE:
        raise HTTPException(409, "This lecture is still processing.")
    await delete_lecture_data(get_db(), lec)


@router.get("/{lecture_id}/audio")
async def get_audio(lecture_id: str):
    lec = await _get(lecture_id)
    path = get_settings().storage_dir / lec["audio_path"]
    if not path.exists():
        raise HTTPException(404, "Audio file is missing from storage.")
    return FileResponse(path, media_type=ALLOWED.get(lec["audio_ext"], "application/octet-stream"))


# ------------------------------------------------------------------------------ processing


async def _start(lecture_id: str, mode: str, background: BackgroundTasks) -> dict:
    db = get_db()
    lec = await _get(lecture_id)
    if lec["status"] in worker.ACTIVE:
        raise HTTPException(409, "This lecture is already being processed.")
    has_transcript = bool(await db["transcripts"].find_one({"lecture_id": lecture_id}))
    if mode != "full" and not has_transcript:
        mode = "full"
    if mode == "full" and not (get_settings().storage_dir / lec["audio_path"]).exists():
        raise HTTPException(409, "The original audio file is missing, so it cannot be re-transcribed.")
    await worker.mark_queued(db, lecture_id, mode)
    background.add_task(worker.run_pipeline, lecture_id, mode)
    return {"id": lecture_id, "status": "queued", "mode": mode}


@router.post("/{lecture_id}/reprocess", status_code=202)
async def reprocess(lecture_id: str, body: ReprocessIn, background: BackgroundTasks):
    return await _start(lecture_id, body.mode, background)


@router.post("/{lecture_id}/regenerate", status_code=202)
async def regenerate(lecture_id: str, background: BackgroundTasks):
    """Rebuild notes, flashcards and assignments from the (possibly corrected) transcript."""
    return await _start(lecture_id, "extract", background)


# ------------------------------------------------------------------------------ transcript


@router.get("/{lecture_id}/transcript")
async def get_transcript(lecture_id: str):
    await _get(lecture_id)
    doc = await get_db()["transcripts"].find_one({"lecture_id": lecture_id})
    if not doc:
        return {"lecture_id": lecture_id, "language": None, "segments": []}
    out = clean(doc)
    out["lecture_id"] = lecture_id
    return out


@router.patch("/{lecture_id}/transcript/segments/{idx}")
async def patch_segment(lecture_id: str, idx: int, body: SegmentPatch):
    db = get_db()
    await _get(lecture_id)
    doc = await db["transcripts"].find_one({"lecture_id": lecture_id})
    if not doc or not (0 <= idx < len(doc["segments"])):
        raise HTTPException(404, "Segment not found.")
    seg = doc["segments"][idx]
    changes: dict = {}
    if body.text is not None:
        text = body.text.strip()
        if not text:
            raise HTTPException(422, "Segment text cannot be empty.")
        changes.update(text=text, edited=text != seg["original_text"])
    if body.excluded is not None:
        changes.update(excluded=body.excluded, user_override=True)
        if body.excluded is False and seg.get("category") in ("casual", "filler"):
            changes["reason"] = "Restored by you"
        if body.excluded is True and not seg.get("reason"):
            changes["reason"] = "Excluded by you"
    if not changes:
        return seg
    await db["transcripts"].update_one(
        {"lecture_id": lecture_id},
        {"$set": {**{f"segments.{idx}.{k}": v for k, v in changes.items()}, "updated_at": now()}},
    )
    await db["lectures"].update_one({"_id": lecture_id}, {"$set": {"materials_stale": True, "updated_at": now()}})
    return {**seg, **changes}


# ------------------------------------------------------------------------------ materials / PDF


@router.get("/{lecture_id}/materials")
async def get_materials(lecture_id: str):
    await _get(lecture_id)
    return clean(await get_db()["studyMaterials"].find_one({"lecture_id": lecture_id}))


@router.get("/{lecture_id}/notes.pdf")
async def notes_pdf(lecture_id: str):
    db, s = get_db(), get_settings()
    lec = await _get(lecture_id)
    materials = await db["studyMaterials"].find_one({"lecture_id": lecture_id})
    if not materials:
        raise HTTPException(409, "Notes have not been generated for this lecture yet.")
    course = await db["courses"].find_one({"_id": lec["course_id"]})
    assignments = await db["assignments"].find(
        {"lecture_id": lecture_id, "status": {"$ne": "dismissed"}}
    ).to_list(500)
    assignments.sort(key=lambda a: (a.get("due_date") or "9999", a.get("title", "")))
    out = s.pdf_dir / f"{lecture_id}.pdf"
    await asyncio.to_thread(pdf.build_notes_pdf, lec, course, materials, assignments, out)
    return FileResponse(out, media_type="application/pdf", filename=f"{slugify(lec['title'])}-notes.pdf")
