from __future__ import annotations

import re

from fastapi import APIRouter, Query

from ..db import get_db
from ..utils import clean

router = APIRouter(tags=["search"])


def _snippet(text: str, rx: re.Pattern, width: int = 160) -> str:
    text = " ".join((text or "").split())
    m = rx.search(text)
    if not m:
        return text[:width]
    start = max(0, m.start() - width // 3)
    end = min(len(text), start + width)
    return ("…" if start else "") + text[start:end] + ("…" if end < len(text) else "")


@router.get("/search")
async def search(q: str = Query(min_length=2), limit: int = 40):
    db = get_db()
    rx = re.compile(re.escape(q.strip()), re.I)
    pattern = {"$regex": re.escape(q.strip()), "$options": "i"}
    lectures = {l["_id"]: l for l in await db["lectures"].find({}).to_list(5000)}
    title = lambda lid: lectures.get(lid, {}).get("title", "")  # noqa: E731
    results: list[dict] = []

    def add(kind: str, lid: str | None, heading: str, text: str, start=None, ref=None) -> None:
        results.append({"type": kind, "lecture_id": lid, "lecture_title": title(lid) if lid else "",
                        "title": heading, "snippet": _snippet(text, rx), "start": start, "ref_id": ref})

    for lec in await db["lectures"].find({"$or": [{"title": pattern}, {"subject": pattern}, {"description": pattern}]}).to_list(50):
        add("lecture", lec["_id"], lec["title"], f"{lec.get('subject', '')} {lec.get('description', '')}".strip() or lec["title"])

    for doc in await db["studyMaterials"].find({"$or": [
        {"summary": pattern}, {"concepts.term": pattern}, {"concepts.definition": pattern},
        {"formulas.expression": pattern}, {"formulas.meaning": pattern}, {"important_points.text": pattern},
        {"exam_topics.topic": pattern}, {"topics.title": pattern}, {"detailed_notes.heading": pattern},
        {"detailed_notes.bullets": pattern}, {"examples.description": pattern},
    ]}).to_list(200):
        lid = doc["lecture_id"]
        if rx.search(doc.get("summary", "")):
            add("summary", lid, "Summary", doc["summary"])
        for c in doc.get("concepts", []):
            if rx.search(c["term"]) or rx.search(c["definition"]):
                add("concept", lid, c["term"], c["definition"], c.get("start"))
        for f in doc.get("formulas", []):
            if rx.search(f["expression"]) or rx.search(f.get("meaning", "")):
                add("formula", lid, f["expression"], f.get("meaning") or f["expression"], f.get("start"))
        for p in doc.get("important_points", []):
            if rx.search(p["text"]):
                add("point", lid, "Important point", p["text"], p.get("start"))
        for x in doc.get("exam_topics", []):
            if rx.search(x["topic"]):
                add("exam", lid, "Likely exam topic", x["topic"], x.get("start"))
        for n in doc.get("detailed_notes", []):
            joined = " ".join(n["bullets"])
            if rx.search(n["heading"]) or rx.search(joined):
                add("notes", lid, n["heading"], joined, n.get("start"))

    for doc in await db["transcripts"].find({"segments.text": pattern}).to_list(200):
        hits = [s for s in doc["segments"] if rx.search(s["text"])][:3]
        for s in hits:
            add("transcript", doc["lecture_id"], "Transcript", s["text"], s["start"])

    for card in await db["flashcards"].find({"$or": [{"question": pattern}, {"answer": pattern}]}).to_list(100):
        add("flashcard", card["lecture_id"], card["question"], card["answer"], card.get("start"), card["_id"])

    for a in await db["assignments"].find({"$or": [{"title": pattern}, {"description": pattern}]}).to_list(100):
        add("assignment", a.get("lecture_id"), a["title"], a.get("description") or a["title"], a.get("start"), a["_id"])

    return {"query": q, "total": len(results), "results": results[:limit]}
