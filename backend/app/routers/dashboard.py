from __future__ import annotations

import importlib.util
from datetime import datetime, timezone

from fastapi import APIRouter

from .. import worker
from ..config import get_settings
from ..db import get_db
from ..services import audio, llm
from ..utils import clean, today_iso

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
async def dashboard():
    db = get_db()
    lectures = await db["lectures"].find({}).sort("created_at", -1).to_list(5000)
    courses = await db["courses"].find({}).to_list(1000)
    names = {c["_id"]: c["name"] for c in courses}

    by_status: dict[str, int] = {}
    for lec in lectures:
        by_status[lec["status"]] = by_status.get(lec["status"], 0) + 1

    def brief(lec: dict) -> dict:
        item = clean(lec)
        item["course_name"] = names.get(lec["course_id"], "")
        item.pop("history", None)
        return item

    events = []
    for lec in lectures[:25]:
        for ev in lec.get("history", []):
            events.append({"lecture_id": lec["_id"], "lecture_title": lec["title"], **ev})
    events.sort(key=lambda e: e["at"], reverse=True)

    cards = await db["flashcards"].find({}).to_list(10000)
    n = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    due_cards = sum(1 for c in cards if c.get("next_review") is None or c["next_review"] <= n)

    assignments = await db["assignments"].find({"status": {"$in": ["suggested", "confirmed"]}}).to_list(2000)
    upcoming = sorted(
        (a for a in assignments if a.get("due_date") and a["due_date"] >= today_iso()),
        key=lambda a: a["due_date"],
    )[:6]
    lecture_titles = {l["_id"]: l["title"] for l in lectures}
    upcoming_out = []
    for a in upcoming:
        row = clean(a)
        row["lecture_title"] = lecture_titles.get(a.get("lecture_id"), "")
        row["course_name"] = names.get(a.get("course_id"), "")
        upcoming_out.append(row)

    return {
        "counts": {
            "courses": len(courses), "lectures": len(lectures), "completed": by_status.get("completed", 0),
            "processing": sum(by_status.get(s, 0) for s in worker.ACTIVE), "failed": by_status.get("failed", 0),
            "flashcards": len(cards), "flashcards_due": due_cards,
            "open_assignments": len(assignments),
        },
        "recent_lectures": [brief(l) for l in lectures[:8]],
        "processing": [brief(l) for l in lectures if l["status"] in worker.ACTIVE],
        "upcoming_assignments": upcoming_out,
        "activity": events[:10],
    }


@router.get("/health")
async def health():
    s = get_settings()
    try:
        await get_db().command("ping")
        mongo = {"ok": True}
    except Exception as exc:  # noqa: BLE001
        mongo = {"ok": False, "error": str(exc)[:160]}
    return {
        "mongo": mongo,
        "ollama": await llm.check_ollama(),
        "ffmpeg": {"ok": audio.ffmpeg_available()},
        "whisper": {"ok": importlib.util.find_spec("whisper") is not None, "model": s.whisper_model},
    }
