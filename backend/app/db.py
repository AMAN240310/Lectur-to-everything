"""MongoDB access (Motor). Collections: courses, lectures, transcripts,
studyMaterials, flashcards, assignments."""
from __future__ import annotations

from typing import Any

from .config import get_settings

_db: Any = None


def get_db() -> Any:
    global _db
    if _db is None:
        from motor.motor_asyncio import AsyncIOMotorClient

        s = get_settings()
        client = AsyncIOMotorClient(s.mongo_uri, serverSelectionTimeoutMS=3000)
        _db = client[s.mongo_db]
    return _db


def set_db(db: Any) -> None:
    """Swap the database (used by tests)."""
    global _db
    _db = db


async def ensure_indexes(db: Any) -> None:
    """Unique indexes are the last line of defence against duplicate records on retries."""
    await db["courses"].create_index([("name", 1), ("semester", 1)], unique=True)
    await db["lectures"].create_index([("course_id", 1), ("audio_sha256", 1)], unique=True)
    await db["lectures"].create_index([("created_at", -1)])
    await db["transcripts"].create_index([("lecture_id", 1)], unique=True)
    await db["studyMaterials"].create_index([("lecture_id", 1)], unique=True)
    await db["flashcards"].create_index([("lecture_id", 1), ("key", 1)], unique=True)
    await db["assignments"].create_index([("lecture_id", 1), ("key", 1)], unique=True)
