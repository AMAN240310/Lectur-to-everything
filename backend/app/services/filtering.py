"""Academic-content filtering.

Segments are never deleted: filtering only sets `category` / `excluded` flags, so the original
transcript stays intact and every exclusion can be reviewed and restored.

Safety net: anything that looks like an assignment, exam or deadline is *always* kept,
whatever the language model says.
"""
from __future__ import annotations

import logging
import re
from typing import Awaitable, Callable

from ..config import get_settings
from ..schemas import ClassifyOut
from ..utils import norm
from . import llm

log = logging.getLogger(__name__)

_LATIN_ADMIN = re.compile(
    r"\b(assignments?|home\s?work|submit(ted|ting)?|submission|deadline|due|exams?|tests?|quiz(zes)?|"
    r"viva|syllabus|marks|project|practicals?|lab\s(file|record|manual)|(mid|end)[\s-]?(sem|term)|"
    r"next\s(class|week|lecture)|jama|kal\stak|parso|agle\shafte|agli\sclass)\b",
    re.I,
)
_DEVANAGARI_ADMIN = (
    "असाइनमेंट", "होमवर्क", "सबमिट", "जमा", "परीक्षा", "टेस्ट", "डेडलाइन", "परसों", "कल तक",
    "अगले हफ्ते", "प्रोजेक्ट", "क्विज़", "क्विज",
)
FILLERS = {
    "hmm", "hm", "mm", "um", "uh", "ah", "oh", "okay", "ok", "yes", "yeah", "haan", "han",
    "achha", "acha", "theek", "right", "so", "hello", "test", "testing", "haha", "hehe", "lol",
    "thanks", "thank", "you",
}

Progress = Callable[[float, str], Awaitable[None]]


def is_admin(text: str) -> bool:
    return bool(_LATIN_ADMIN.search(text)) or any(w in text for w in _DEVANAGARI_ADMIN)


def is_filler(text: str) -> bool:
    words = norm(text).split()
    return not words or (len(words) <= 3 and all(w in FILLERS for w in words))


SYSTEM = """You classify segments of a classroom lecture transcript. The transcript may be English, Hindi, or Hinglish (Hindi and English mixed).

Categories:
- academic: teaching content (explanations, definitions, formulas, examples, derivations, questions about the subject).
- admin: assignments, homework, exams, tests, deadlines, submissions, syllabus, schedules, instructions to students.
- casual: greetings, jokes, off-topic chat, attendance, personal stories, classroom logistics (AC, projector, noise).
- filler: non-informational noise such as "hmm", "okay", repeated words, unintelligible fragments.

When unsure, treat the segment as academic.
Reply with ONLY a JSON object listing the segments that are NOT academic:
{"non_academic": [{"i": <segment index>, "label": "casual" | "filler" | "admin", "reason": "<short reason>"}]}
If every segment is academic reply {"non_academic": []}."""


async def classify_segments(
    segments: list[dict], subject: str = "", on_progress: Progress | None = None
) -> tuple[list[dict], list[str]]:
    """Set category/excluded on each segment. Returns (segments, warnings)."""
    warnings: list[str] = []
    s = get_settings()

    candidates: list[dict] = []
    for seg in segments:
        if seg.get("user_override"):
            continue  # the user's decision always wins
        seg["category"], seg["excluded"], seg["reason"] = "academic", False, ""
        text = seg.get("text", "")
        if is_admin(text):
            seg["category"] = "admin"
        elif is_filler(text):
            seg["category"], seg["excluded"], seg["reason"] = "filler", True, "Filler / non-informational"
        else:
            candidates.append(seg)

    batches: list[list[dict]] = []
    current: list[dict] = []
    size = 0
    for seg in candidates:
        current.append(seg)
        size += len(seg["text"])
        if len(current) >= s.classify_batch or size >= s.chunk_chars:
            batches.append(current)
            current, size = [], 0
    if current:
        batches.append(current)

    by_idx = {seg["idx"]: seg for seg in candidates}
    for n, batch in enumerate(batches):
        listing = "\n".join(f"[{seg['idx']}] {seg['text']}" for seg in batch)
        user = f"Subject: {subject or 'unknown'}\n\nSegments:\n{listing}"
        try:
            result = await llm.chat_json(SYSTEM, user, ClassifyOut)
        except llm.LLMUnavailable:
            raise
        except llm.LLMError as exc:
            warnings.append(f"Filtering skipped for a block of segments (kept everything): {exc}")
            result = ClassifyOut()
        valid = {seg["idx"] for seg in batch}
        for item in result.non_academic:
            seg = by_idx.get(item.i)
            if seg is None or item.i not in valid:
                continue
            if item.label == "admin":
                seg["category"] = "admin"
            else:
                seg["category"], seg["excluded"] = item.label, True
                seg["reason"] = item.reason or ("Casual conversation" if item.label == "casual" else "Filler")
        if on_progress:
            await on_progress((n + 1) / len(batches), f"Filtering transcript ({n + 1}/{len(batches)})")
    return segments, warnings
