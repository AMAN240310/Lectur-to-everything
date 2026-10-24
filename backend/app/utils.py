from __future__ import annotations

import hashlib
import re
import uuid
from datetime import date, datetime, timezone
from typing import Any


def new_id() -> str:
    return uuid.uuid4().hex


def now() -> str:
    """UTC timestamp as a sortable ISO string (avoids naive/aware datetime issues)."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def today_iso() -> str:
    return date.today().isoformat()


def clean(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Rename Mongo's _id to id for API responses."""
    if doc is None:
        return None
    out = dict(doc)
    if "_id" in out:
        out["id"] = out.pop("_id")
    return out


_WS = re.compile(r"\s+")
# ASCII punctuation plus common Unicode punctuation. Deliberately does NOT use \w so
# Devanagari vowel signs (combining marks) are preserved.
_PUNCT = re.compile(r"[!-/:-@\[-`{-~।॥“”‘’…–—]")


def norm(text: str | None) -> str:
    return _WS.sub(" ", _PUNCT.sub(" ", (text or "").lower())).strip()


def key_for(*parts: str | None) -> str:
    """Stable dedupe key so retries and regenerations never create duplicates."""
    joined = "|".join(norm(p) for p in parts)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()[:20]


_STOP = {
    "the", "and", "for", "that", "this", "with", "are", "was", "you", "your", "can", "will",
    "have", "has", "from", "not", "but", "what", "which", "when", "how", "why", "its",
    "hai", "hain", "hota", "hoti", "hote", "ka", "ki", "ke", "ko", "se", "me", "mein", "par",
    "ye", "yeh", "wo", "woh", "to", "toh", "aur", "ek", "hum", "aap", "tha", "thi", "kar",
    "karte", "karna", "kya", "jo", "ya", "bhi", "nahi", "liye",
}


def tokens(text: str | None) -> set[str]:
    return {t for t in norm(text).split() if len(t) > 2 and t not in _STOP}


def fmt_ts(seconds: float | int | None) -> str:
    sec = int(seconds or 0)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def slugify(text: str, fallback: str = "lecture") -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    return slug or fallback
