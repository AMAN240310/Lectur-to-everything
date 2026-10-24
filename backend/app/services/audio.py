"""FFmpeg helpers: probing and normalising uploaded recordings."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


class AudioError(Exception):
    pass


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def probe_duration(path: Path) -> float | None:
    exe = shutil.which("ffprobe")
    if not exe:
        return None
    try:
        proc = subprocess.run(
            [exe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True, text=True, timeout=60,
        )
        return float(proc.stdout.strip())
    except (ValueError, subprocess.SubprocessError, OSError):
        return None


def prepare_wav(src: Path, tmp_dir: Path) -> Path:
    """Decode any supported recording to 16 kHz mono WAV (what Whisper uses internally).

    Doing this up front gives a clear error for corrupt files instead of a Whisper stack trace.
    """
    exe = shutil.which("ffmpeg")
    if not exe:
        raise AudioError("FFmpeg was not found on PATH. Install FFmpeg and restart the backend.")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    dst = tmp_dir / f"{src.stem}.16k.wav"
    proc = subprocess.run(
        [exe, "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dst)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0 or not dst.exists():
        tail = (proc.stderr or "").strip().splitlines()[-1:] or ["unknown error"]
        raise AudioError(f"Could not decode the audio file: {tail[0]}")
    return dst
