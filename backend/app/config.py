from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LTE_", env_file=".env", extra="ignore")

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "lecture_to_everything"

    storage_dir: Path = BACKEND_DIR / "storage"
    max_upload_mb: int = 2048

    whisper_model: str = "small"
    whisper_device: str = "auto"

    transcription_engine: str = "whisper"  # "whisper" or "elevenlabs"
    elevenlabs_api_key: str = ""
    elevenlabs_model: str = "scribe_v1"

    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "gemma3:4b"
    ollama_timeout: float = 900.0
    ollama_num_ctx: int = 8192

    chunk_chars: int = 5000
    classify_batch: int = 50
    notes_language: str = "English"
    pdf_font: str | None = None

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def audio_dir(self) -> Path:
        return self.storage_dir / "audio"

    @property
    def pdf_dir(self) -> Path:
        return self.storage_dir / "pdfs"

    @property
    def tmp_dir(self) -> Path:
        return self.storage_dir / "tmp"

    def ensure_dirs(self) -> None:
        for d in (self.audio_dir, self.pdf_dir, self.tmp_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()