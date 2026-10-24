from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pymongo.errors import DuplicateKeyError

from ..db import get_db
from ..schemas import CourseIn, CoursePatch
from ..utils import clean, new_id, now
from .lectures import delete_lecture_data

router = APIRouter(prefix="/courses", tags=["courses"])


async def _with_counts(db, course: dict) -> dict:
    lectures = await db["lectures"].find({"course_id": course["_id"]}).to_list(5000)
    out = clean(course)
    out["lecture_count"] = len(lectures)
    out["completed_count"] = sum(1 for lec in lectures if lec["status"] == "completed")
    out["total_duration_sec"] = sum(lec.get("duration_sec") or 0 for lec in lectures)
    return out


@router.get("")
async def list_courses():
    db = get_db()
    courses = await db["courses"].find({}).sort("created_at", -1).to_list(1000)
    return [await _with_counts(db, c) for c in courses]


@router.post("", status_code=201)
async def create_course(body: CourseIn):
    db = get_db()
    doc = {"_id": new_id(), **body.model_dump(), "created_at": now(), "updated_at": now()}
    doc["name"] = doc["name"].strip()
    try:
        await db["courses"].insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "A course with this name and semester already exists.")
    return await _with_counts(db, doc)


@router.get("/{course_id}")
async def get_course(course_id: str):
    db = get_db()
    course = await db["courses"].find_one({"_id": course_id})
    if not course:
        raise HTTPException(404, "Course not found.")
    return await _with_counts(db, course)


@router.patch("/{course_id}")
async def update_course(course_id: str, body: CoursePatch):
    db = get_db()
    changes = body.model_dump(exclude_none=True)
    if "name" in changes:
        changes["name"] = changes["name"].strip()
    try:
        res = await db["courses"].update_one({"_id": course_id}, {"$set": {**changes, "updated_at": now()}})
    except DuplicateKeyError:
        raise HTTPException(409, "A course with this name and semester already exists.")
    if res.matched_count == 0:
        raise HTTPException(404, "Course not found.")
    return await _with_counts(db, await db["courses"].find_one({"_id": course_id}))


@router.delete("/{course_id}", status_code=204)
async def delete_course(course_id: str, cascade: bool = False):
    db = get_db()
    if not await db["courses"].find_one({"_id": course_id}):
        raise HTTPException(404, "Course not found.")
    lectures = await db["lectures"].find({"course_id": course_id}).to_list(5000)
    if lectures and not cascade:
        raise HTTPException(409, f"This course still has {len(lectures)} lecture(s). Delete them first or use cascade.")
    for lec in lectures:
        if lec["status"] in ("queued", "transcribing", "filtering", "extracting"):
            raise HTTPException(409, "A lecture in this course is still processing.")
    for lec in lectures:
        await delete_lecture_data(db, lec)
    await db["assignments"].delete_many({"course_id": course_id})
    await db["courses"].delete_one({"_id": course_id})
