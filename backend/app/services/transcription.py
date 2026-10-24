"""Local speech recognition with the open-source `openai-whisper` package."""
from __future__ import annotations

import math
import threading
from typing import Any

from ..config import get_settings


class TranscriptionError(Exception):
    pass


_lock = threading.Lock()
_model: Any = None
_model_key: tuple[str, str] | None = None

# Whisper tends to write Hindi in Devanagari. A Roman-script Hinglish prompt nudges it to
# keep Hinglish in Roman script and leave English technical terms untouched.
HINGLISH_PROMPT = (
    "Aaj hum lecture shuru karte hain. Yeh class Hindi aur English mix mein hai, "
    "jaise algorithm, data structure, function aur time complexity."
)


def _load_model() -> Any:
    global _model, _model_key
    s = get_settings()
    with _lock:
        key = (s.whisper_model, s.whisper_device)
        if _model is None or _model_key != key:
            try:
                import torch
                import whisper
            except ImportError as exc:
                raise TranscriptionError(
                    "openai-whisper is not installed. Run: pip install openai-whisper"
                ) from exc
            device = s.whisper_device
            if device == "auto":
                device = "cuda" if torch.cuda.is_available() else "cpu"
            _model = whisper.load_model(s.whisper_model, device=device)
            _model_key = key
        return _model


def transcribe_file(path: str, language_hint: str = "auto", context: str = "") -> dict:
    """Transcribe an audio file. Returns {language, duration, segments[]} with timestamps.

    language_hint: "auto" (detect), "hinglish", or a Whisper language code such as "en"/"hi".
    context: lecture title/subject, used as a vocabulary hint for technical terms.
    """
    model = _load_model()
    s = get_settings()
    options: dict[str, Any] = {
        "task": "transcribe",
        "condition_on_previous_text": False,  # avoids repetition loops on long recordings
        "fp16": s.whisper_device == "cuda" or (s.whisper_device == "auto" and _cuda()),
        "verbose": None,
    }
    prompt_parts = [context.strip()] if context.strip() else []
    if language_hint == "hinglish":
        options["language"] = "hi"
        prompt_parts.append(HINGLISH_PROMPT)
    elif language_hint != "auto":
        options["language"] = language_hint
    if prompt_parts:
        options["initial_prompt"] = " ".join(prompt_parts)

    try:
        result = model.transcribe(path, **options)
    except Exception as exc:  # noqa: BLE001
        raise TranscriptionError(f"Whisper failed: {exc}") from exc

    segments = []
    for seg in result.get("segments", []):
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        segments.append(
            {
                "start": round(float(seg["start"]), 2),
                "end": round(float(seg["end"]), 2),
                "text": text,
                "confidence": round(math.exp(min(0.0, float(seg.get("avg_logprob", -1.0)))), 3),
            }
        )
    duration = segments[-1]["end"] if segments else 0.0
    return {"language": result.get("language"), "duration": duration, "segments": segments}


def _cuda() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except ImportError:
        return False
