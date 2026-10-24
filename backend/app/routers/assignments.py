from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException

from ..db import get_db
from ..schemas import AssignmentIn, AssignmentPatch
from ..utils import clean, new_id, now

router = APIRouter(prefix="/assignments", tags=["assignments"])


def _check_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise HTTPException(422, "Due date must be in YYYY-MM-DD format.")


async def _decorate(db, items: list[dict]) -> list[dict]:
    lectures = {l["_id"]: l for l in await db["lectures"].find({}).to_list(5000)}
    courses = {c["_id"]: c["name"] for c in await db["courses"].find({}).to_list(1000)}
    out = []
    for a in items:
        row = clean(a)
        row["lecture_title"] = lectures.get(a.get("lecture_id"), {}).get("title", "")
        row["course_name"] = courses.get(a.get("course_id"), "")
        out.append(row)
    return out


@router.get("")
async def list_assignments(
    course_id: str | None = None, lecture_id: str | None = None, status: str | None = None,
    include_dismissed: bool = False,
):
    db = get_db()
    q: dict = {}
    if course_id:
        q["course_id"] = course_id
    if lecture_id:
        q["lecture_id"] = lecture_id
    if status:
        q["status"] = status
    elif not include_dismissed:
        q["status"] = {"$ne": "dismissed"}
    items = await db["assignments"].find(q).to_list(2000)
    items.sort(key=lambda a: (a.get("due_date") or "9999-12-31", a.get("title", "")))
    return await _decorate(db, items)


@router.post("", status_code=201)
async def create_assignment(body: AssignmentIn):
    db = get_db()
    course_id = body.course_id
    if body.lecture_id:
        lec = await db["lectures"].find_one({"_id": body.lecture_id})
        if not lec:
            raise HTTPException(404, "Lecture not found.")
        course_id = course_id or lec["course_id"]
    doc = {
        "_id": new_id(), "lecture_id": body.lecture_id, "course_id": course_id, "title": body.title.strip(),
        "description": body.description.strip(), "kind": body.kind, "deadline_text": "",
        "due_date": _check_date(body.due_date), "status": "confirmed", "source": "manual", "key": new_id(),
        "user_edited": True, "evidence": "", "start": None, "verified": False,
        "created_at": now(), "updated_at": now(),
    }
    await db["assignments"].insert_one(doc)
    return (await _decorate(db, [doc]))[0]


@router.patch("/{assignment_id}")
async def update_assignment(assignment_id: str, body: AssignmentPatch):
    db = get_db()
    changes = body.model_dump(exclude_unset=True)
    if "due_date" in changes:
        changes["due_date"] = _check_date(changes["due_date"])
    if "title" in changes:
        changes["title"] = changes["title"].strip()
    if not changes:
        raise HTTPException(422, "Nothing to update.")
    if set(changes) - {"status"}:
        changes["user_edited"] = True  # protects edits from being overwritten on regeneration
    res = await db["assignments"].update_one({"_id": assignment_id}, {"$set": {**changes, "updated_at": now()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Assignment not found.")
    return (await _decorate(db, [await db["assignments"].find_one({"_id": assignment_id})]))[0]


@router.delete("/{assignment_id}", status_code=204)
async def delete_assignment(assignment_id: str):
    res = await get_db()["assignments"].delete_one({"_id": assignment_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Assignment not found.")
