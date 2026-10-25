"""Optional cloud transcription with ElevenLabs Scribe.

Returns segments shaped like Whisper's: [{"start": float, "end": float, "text": str}].
"""
from pathlib import Path

import httpx

API_URL = "https://api.elevenlabs.io/v1/speech-to-text"
SENTENCE_END = (".", "?", "!", "।", "…")
MAX_GAP_S = 1.0       # a pause longer than this starts a new segment
MAX_SEGMENT_S = 15.0  # hard cap so segments stay clickable in the transcript


def words_to_segments(words: list[dict]) -> list[dict]:
    segments: list[dict] = []
    cur: list[dict] = []

    def flush() -> None:
        if cur:
            text = " ".join(w["text"].strip() for w in cur).strip()
            if text:
                segments.append({"start": cur[0]["start"], "end": cur[-1]["end"], "text": text})
            cur.clear()

    for w in words:
        if w.get("type", "word") != "word":  # skip spacing / audio events
            continue
        if cur and (
            w["start"] - cur[-1]["end"] > MAX_GAP_S
            or w["end"] - cur[0]["start"] > MAX_SEGMENT_S
        ):
            flush()
        cur.append(w)
        if w["text"].strip().endswith(SENTENCE_END):
            flush()
    flush()
    return segments


def transcribe_with_elevenlabs(
    audio_path: str | Path,
    api_key: str,
    model_id: str = "scribe_v1",
    language: str | None = None,  # e.g. "en", "hi"; None = auto-detect
    timeout: float = 900,
) -> tuple[list[dict], str | None]:
    if not api_key:
        raise RuntimeError("LTE_ELEVENLABS_API_KEY is not set")
    data = {"model_id": model_id, "timestamps_granularity": "word"}
    if language:
        data["language_code"] = language
    path = Path(audio_path)
    with path.open("rb") as f:
        resp = httpx.post(
            API_URL,
            headers={"xi-api-key": api_key},
            data=data,
            files={"file": (path.name, f)},
            timeout=timeout,
        )
    resp.raise_for_status()
    payload = resp.json()
    return words_to_segments(payload.get("words", [])), payload.get("language_code")