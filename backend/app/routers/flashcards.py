from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from ..db import get_db
from ..schemas import ReviewIn
from ..utils import clean, now

router = APIRouter(prefix="/flashcards", tags=["flashcards"])

# Leitner boxes: days until a "known" card is due again.
INTERVAL_DAYS = [1, 2, 4, 8, 16, 32]


def _query(course_id, lecture_id, topic, status, due) -> dict:
    q: dict = {}
    if course_id:
        q["course_id"] = course_id
    if lecture_id:
        q["lecture_id"] = lecture_id
    if topic:
        q["topic"] = topic
    if status:
        q["status"] = status
    if due:
        q["$or"] = [{"next_review": None}, {"next_review": {"$lte": now()}}]
    return q


@router.get("")
async def list_flashcards(
    course_id: str | None = None, lecture_id: str | None = None, topic: str | None = None,
    status: str | None = None, due: bool = False, limit: int = 500,
):
    db = get_db()
    cards = await db["flashcards"].find(_query(course_id, lecture_id, topic, status, due)).to_list(min(limit, 2000))
    cards.sort(key=lambda c: (c["lecture_id"], c.get("start") or 0))
    lectures = {l["_id"]: l["title"] for l in await db["lectures"].find({}).to_list(2000)}
    out = []
    for c in cards:
        item = clean(c)
        item["lecture_title"] = lectures.get(c["lecture_id"], "")
        out.append(item)
    return out


@router.get("/stats")
async def stats(course_id: str | None = None, lecture_id: str | None = None):
    db = get_db()
    cards = await db["flashcards"].find(_query(course_id, lecture_id, None, None, False)).to_list(5000)
    n = now()
    counts = {"new": 0, "known": 0, "difficult": 0}
    due = 0
    for c in cards:
        counts[c["status"]] = counts.get(c["status"], 0) + 1
        if c.get("next_review") is None or c["next_review"] <= n:
            due += 1
    topics = sorted({c.get("topic", "General") for c in cards})
    return {"total": len(cards), **counts, "due": due, "topics": topics}


@router.post("/{card_id}/review")
async def review(card_id: str, body: ReviewIn):
    db = get_db()
    card = await db["flashcards"].find_one({"_id": card_id})
    if not card:
        raise HTTPException(404, "Flashcard not found.")
    n = datetime.now(timezone.utc)
    if body.result == "known":
        box = min(card.get("box", 0) + 1, len(INTERVAL_DAYS) - 1)
        changes = {"status": "known", "box": box,
                   "next_review": (n + timedelta(days=INTERVAL_DAYS[box])).isoformat(timespec="milliseconds")}
    elif body.result == "difficult":
        changes = {"status": "difficult", "box": 0, "next_review": n.isoformat(timespec="milliseconds")}
    else:
        changes = {"status": "new", "box": 0, "next_review": None}
    if body.result != "reset":
        changes.update(last_reviewed=n.isoformat(timespec="milliseconds"))
    await db["flashcards"].update_one(
        {"_id": card_id},
        {"$set": {**changes, "updated_at": now()}, **({"$inc": {"review_count": 1}} if body.result != "reset" else {})},
    )
    return clean(await db["flashcards"].find_one({"_id": card_id}))
