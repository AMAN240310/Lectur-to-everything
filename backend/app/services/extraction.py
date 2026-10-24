"""AI content extraction with the local Gemma model.

Every extracted item is linked back to the transcript. The model only returns a segment index
(`seg`); the timestamp and evidence excerpt are then copied from the *real* transcript, so
evidence can never be invented by the model. If the index is missing or wrong, the item is
matched to the most similar segment in the chunk by word overlap.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Awaitable, Callable

from ..config import get_settings
from ..schemas import ChunkExtraction, SummaryOut
from ..utils import key_for, norm, tokens
from . import llm

log = logging.getLogger(__name__)
Progress = Callable[[float, str], Awaitable[None]]


class NothingToExtract(Exception):
    pass


SYSTEM = """You are a meticulous teaching assistant who turns a lecture transcript into study material.
The transcript may be English, Hindi, or Hinglish (mixed). Each line starts with a segment index like [12].

Rules:
- Use ONLY information stated in the transcript. Never invent facts, formulas or deadlines.
- Keep technical terms in English exactly as spoken.
- Write everything in {language}.
- "seg" is the index of the segment where the item is said. Always include it.
- Return empty lists when nothing fits. Do not pad.
- For assignments: "deadline_text" is the teacher's own words about the deadline; "due_date" is YYYY-MM-DD only if it can be worked out from the lecture date given below (e.g. "next Monday"), otherwise null.

Reply with ONLY one JSON object of this shape:
{{
  "summary": "3-5 sentence summary of this part",
  "topics": [{{"title": "", "summary": "one sentence", "seg": 0}}],
  "notes": [{{"heading": "", "bullets": ["", ""], "seg": 0}}],
  "concepts": [{{"term": "", "definition": "", "seg": 0}}],
  "formulas": [{{"expression": "", "meaning": "what it computes", "seg": 0}}],
  "examples": [{{"title": "", "description": "", "seg": 0}}],
  "important_points": [{{"text": "", "seg": 0}}],
  "exam_topics": [{{"topic": "", "seg": 0}}],
  "assignments": [{{"title": "", "description": "", "kind": "assignment|exam|deadline|instruction|reading", "deadline_text": "", "due_date": null, "seg": 0}}],
  "qa": [{{"question": "", "answer": "", "seg": 0}}]
}}
"qa" holds 3-8 good revision questions with short, correct answers taken from the content."""

SUMMARY_SYSTEM = (
    "You combine partial summaries of one lecture into a single coherent summary of 5-8 sentences "
    'written in {language}. Reply with ONLY JSON: {{"summary": "..."}}'
)


# ------------------------------------------------------------------------------ helpers


def build_chunks(segments: list[dict], max_chars: int) -> list[list[dict]]:
    chunks: list[list[dict]] = []
    current: list[dict] = []
    size = 0
    for seg in segments:
        if current and size + len(seg["text"]) > max_chars:
            chunks.append(current)
            current, size = [], 0
        current.append(seg)
        size += len(seg["text"]) + 8
    if current:
        chunks.append(current)
    return chunks


def excerpt(text: str, limit: int = 280) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def locate(seg_ref: int | None, probe: str, chunk: list[dict]) -> dict | None:
    """Return the transcript segment backing an item (trusting the index when valid)."""
    by_idx = {s["idx"]: s for s in chunk}
    if seg_ref is not None and seg_ref in by_idx:
        return by_idx[seg_ref]
    want = tokens(probe)
    if not want:
        return None
    best, best_score = None, 0.0
    for seg in chunk:
        have = tokens(seg["text"])
        if not have:
            continue
        score = len(want & have) / len(want)
        if score > best_score:
            best, best_score = seg, score
    return best if best_score >= 0.25 else None


def evidence(seg: dict | None) -> dict:
    if seg is None:
        return {"seg": None, "start": None, "end": None, "evidence": "", "verified": False}
    return {
        "seg": seg["idx"],
        "start": seg["start"],
        "end": seg["end"],
        "evidence": excerpt(seg["text"]),
        "verified": True,
    }


def _weekday(iso: str) -> str:
    try:
        return date.fromisoformat(iso).strftime("%A")
    except ValueError:
        return ""


def _valid_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip()[:10]).isoformat()
    except ValueError:
        return None


# ------------------------------------------------------------------------------ main


async def extract_all(
    segments: list[dict], ctx: dict, on_progress: Progress | None = None
) -> tuple[dict, list[str]]:
    """Run extraction over every non-excluded segment. Returns (materials, warnings)."""
    s = get_settings()
    included = [seg for seg in segments if not seg.get("excluded")]
    if not included:
        raise NothingToExtract(
            "Every segment is excluded as non-academic. Restore some content in the transcript and regenerate."
        )
    chunks = build_chunks(included, s.chunk_chars)
    system = SYSTEM.format(language=s.notes_language)
    warnings: list[str] = []
    results: list[tuple[list[dict], ChunkExtraction]] = []

    header = (
        f"Lecture: {ctx.get('title', '')}\nSubject: {ctx.get('subject', '') or ctx.get('course', '')}\n"
        f"Lecture date: {ctx.get('date', '')} ({_weekday(ctx.get('date', ''))})\n"
    )
    for n, chunk in enumerate(chunks):
        listing = "\n".join(f"[{seg['idx']}] {seg['text']}" for seg in chunk)
        try:
            res = await llm.chat_json(system, f"{header}\nTranscript part {n + 1} of {len(chunks)}:\n{listing}", ChunkExtraction)
            results.append((chunk, res))
        except llm.LLMUnavailable:
            raise
        except llm.LLMError as exc:
            warnings.append(f"Part {n + 1} of {len(chunks)} could not be analysed: {exc}")
        if on_progress:
            await on_progress((n + 1) / len(chunks), f"Extracting study material ({n + 1}/{len(chunks)})")
    if not results:
        raise llm.LLMInvalid("The language model could not analyse any part of this lecture.")

    materials = _merge(results, included)

    # Overall summary
    partials = [r.summary.strip() for _, r in results if r.summary.strip()]
    if len(partials) <= 1:
        materials["summary"] = partials[0] if partials else ""
    else:
        try:
            out = await llm.chat_json(
                SUMMARY_SYSTEM.format(language=s.notes_language),
                f"Lecture: {ctx.get('title', '')}\n\nPartial summaries:\n" + "\n".join(f"- {p}" for p in partials),
                SummaryOut,
            )
            materials["summary"] = out.summary.strip()
        except llm.LLMUnavailable:
            raise
        except llm.LLMError:
            materials["summary"] = " ".join(partials)
            warnings.append("Could not merge partial summaries; showing them joined.")
    return materials, warnings


def _merge(results: list[tuple[list[dict], ChunkExtraction]], included: list[dict]) -> dict:
    concepts: dict[str, dict] = {}
    formulas: dict[str, dict] = {}
    examples: dict[str, dict] = {}
    points: dict[str, dict] = {}
    exam_topics: dict[str, dict] = {}
    qa: dict[str, dict] = {}
    assignments: dict[str, dict] = {}
    topics: list[dict] = []
    notes: list[dict] = []

    for chunk, res in results:
        first = chunk[0]
        for t in res.topics:
            if not t.title.strip():
                continue
            seg = locate(t.seg, f"{t.title} {t.summary}", chunk) or first
            topics.append({"title": t.title.strip(), "summary": t.summary.strip(), "start": seg["start"], "seg": seg["idx"]})
        if not res.topics:
            topics.append({"title": f"Section starting {int(first['start'] // 60)} min", "summary": res.summary.strip(), "start": first["start"], "seg": first["idx"]})
        for sec in res.notes:
            bullets = [b.strip() for b in sec.bullets if b and b.strip()]
            if sec.heading.strip() and bullets:
                seg = locate(sec.seg, f"{sec.heading} {' '.join(bullets)}", chunk) or first
                notes.append({"heading": sec.heading.strip(), "bullets": bullets, "start": seg["start"], "seg": seg["idx"]})
        for c in res.concepts:
            if c.term.strip() and c.definition.strip():
                concepts.setdefault(norm(c.term), {"term": c.term.strip(), "definition": c.definition.strip(), **evidence(locate(c.seg, f"{c.term} {c.definition}", chunk))})
        for f in res.formulas:
            if f.expression.strip():
                formulas.setdefault(norm(f.expression), {"expression": f.expression.strip(), "meaning": f.meaning.strip(), **evidence(locate(f.seg, f"{f.expression} {f.meaning}", chunk))})
        for e in res.examples:
            if e.description.strip():
                examples.setdefault(norm(e.title + e.description), {"title": e.title.strip(), "description": e.description.strip(), **evidence(locate(e.seg, f"{e.title} {e.description}", chunk))})
        for p in res.important_points:
            if p.text.strip():
                points.setdefault(norm(p.text), {"text": p.text.strip(), **evidence(locate(p.seg, p.text, chunk))})
        for x in res.exam_topics:
            if x.topic.strip():
                exam_topics.setdefault(norm(x.topic), {"topic": x.topic.strip(), **evidence(locate(x.seg, x.topic, chunk))})
        for q in res.qa:
            if q.question.strip() and q.answer.strip():
                qa.setdefault(norm(q.question), {"question": q.question.strip(), "answer": q.answer.strip(), **evidence(locate(q.seg, f"{q.question} {q.answer}", chunk))})
        for a in res.assignments:
            if a.title.strip():
                due = _valid_date(a.due_date)
                key = key_for(a.title, due or "")
                assignments.setdefault(key, {
                    "key": key, "title": a.title.strip(), "description": a.description.strip(), "kind": a.kind,
                    "deadline_text": a.deadline_text.strip(), "due_date": due,
                    **evidence(locate(a.seg, f"{a.title} {a.description} {a.deadline_text}", chunk)),
                })

    # Topics: order by time, merge repeated headings across chunk boundaries, add end times.
    topics.sort(key=lambda t: t["start"])
    merged: list[dict] = []
    for t in topics:
        if merged and norm(merged[-1]["title"]) == norm(t["title"]):
            continue
        merged.append(t)
    last_end = max(seg["end"] for seg in included)
    for i, t in enumerate(merged):
        t["end"] = merged[i + 1]["start"] if i + 1 < len(merged) else last_end
    notes.sort(key=lambda n: n["start"])

    return {
        "topics": merged,
        "detailed_notes": notes,
        "concepts": list(concepts.values()),
        "formulas": list(formulas.values()),
        "examples": list(examples.values()),
        "important_points": list(points.values()),
        "exam_topics": list(exam_topics.values()),
        "qa": list(qa.values()),
        "assignments": list(assignments.values()),
    }


# ------------------------------------------------------------------------------ flashcards


def topic_for(start: float | None, topics: list[dict]) -> str:
    if start is None or not topics:
        return "General"
    current = topics[0]["title"]
    for t in topics:
        if t["start"] <= start:
            current = t["title"]
        else:
            break
    return current


def build_flashcards(materials: dict) -> list[dict]:
    """Derive question/answer cards from extracted Q&A, concepts and formulas."""
    topics = materials.get("topics", [])
    cards: dict[str, dict] = {}

    def add(kind: str, question: str, answer: str, ev: dict) -> None:
        key = key_for(question)
        cards.setdefault(key, {
            "key": key, "type": kind, "question": question, "answer": answer,
            "topic": topic_for(ev.get("start"), topics),
            "start": ev.get("start"), "evidence": ev.get("evidence", ""),
        })

    for q in materials.get("qa", []):
        add("qa", q["question"], q["answer"], q)
    for c in materials.get("concepts", []):
        add("definition", f"What is {c['term']}?", c["definition"], c)
    for f in materials.get("formulas", []):
        if f.get("meaning"):
            add("formula", f"What is the expression for: {f['meaning']}?", f["expression"], f)
    return list(cards.values())
