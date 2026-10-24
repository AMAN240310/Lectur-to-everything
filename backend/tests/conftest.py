"""Test fixtures. Whisper, FFmpeg and Ollama are replaced with deterministic fakes so the
full pipeline (upload -> transcribe -> filter -> extract -> persist) runs in milliseconds."""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db as db_module  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas import ChunkExtraction, ClassifyOut, SummaryOut  # noqa: E402
from app.services import audio, llm, transcription  # noqa: E402

FAKE_SEGMENTS = [
    (0.0, 5.0, "Good morning everyone, aaj weather kitna accha hai"),
    (5.0, 14.0, "aaj hum stack data structure padhenge, stack ek LIFO structure hota hai"),
    (14.0, 22.0, "push operation ka time complexity O(1) hota hai"),
    (22.0, 24.0, "haha okay okay"),
    (24.0, 33.0, "assignment number 3 next Monday tak submit karna hai"),
    (33.0, 45.0, "for example balanced parentheses check karne ke liye stack use karte hain"),
]


def fake_transcribe(path, language_hint="auto", context=""):
    return {
        "language": "hi",
        "duration": 45.0,
        "segments": [{"start": a, "end": b, "text": t, "confidence": 0.9} for a, b, t in FAKE_SEGMENTS],
    }


class FakeLLM:
    """Stands in for Gemma. Parses the numbered segments out of the prompt like a real model would."""

    def __init__(self) -> None:
        self.error: Exception | None = None
        self.calls: list[str] = []

    @staticmethod
    def _lines(user: str) -> dict[int, str]:
        return {int(i): t for i, t in re.findall(r"^\[(\d+)\] (.*)$", user, re.M)}

    async def __call__(self, system, user, schema, **kwargs):
        self.calls.append(schema.__name__)
        if self.error:
            raise self.error
        lines = self._lines(user)
        find = lambda needle: next((i for i, t in lines.items() if needle in t), None)  # noqa: E731
        if schema is ClassifyOut:
            return ClassifyOut.model_validate({"non_academic": [
                {"i": i, "label": "casual", "reason": "Small talk about the weather"}
                for i, t in lines.items() if "weather" in t
            ]})
        if schema is SummaryOut:
            return SummaryOut(summary="Merged summary.")
        stack = find("LIFO")
        return ChunkExtraction.model_validate({
            "summary": "The lecture introduces the stack data structure.",
            "topics": [{"title": "Stack basics", "summary": "LIFO and push", "seg": stack}],
            "notes": [{"heading": "Stack", "bullets": ["A stack is LIFO", "Push is O(1)"], "seg": stack}],
            "concepts": [{"term": "Stack", "definition": "A LIFO data structure", "seg": stack}],
            "formulas": [{"expression": "push = O(1)", "meaning": "time complexity of push", "seg": find("O(1)")}],
            "examples": [{"title": "Parentheses", "description": "Checking balanced parentheses with a stack", "seg": find("parentheses")}],
            "important_points": [{"text": "Stack follows LIFO", "seg": stack}],
            "exam_topics": ["Stack operations"],
            "assignments": [{"title": "Assignment 3", "description": "Submit assignment 3", "kind": "assignment",
                             "deadline_text": "next Monday", "due_date": "2026-10-26", "seg": find("assignment")}],
            "qa": [{"question": "What is a stack?", "answer": "A LIFO data structure", "seg": stack}],
        })


@pytest.fixture
def fake_llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(llm, "chat_json", fake)
    return fake


@pytest.fixture
def client(tmp_path, monkeypatch, fake_llm):
    settings = get_settings()
    monkeypatch.setattr(settings, "storage_dir", tmp_path / "storage")
    db_module.set_db(AsyncMongoMockClient()["test"])
    monkeypatch.setattr(transcription, "transcribe_file", fake_transcribe)
    monkeypatch.setattr(audio, "prepare_wav", lambda src, tmp: src)
    monkeypatch.setattr(audio, "probe_duration", lambda path: 45.0)
    with TestClient(app) as c:
        yield c
    db_module.set_db(None)


@pytest.fixture
def course(client):
    return client.post("/api/courses", json={"name": "Data Structures", "semester": "3"}).json()


def upload(client, course_id, content=b"fake-audio-bytes-1", name="lecture.mp3", **extra):
    data = {"title": "Stacks", "course_id": course_id, "subject": "Computer Science", "date": "2026-10-19",
            "language": "hinglish", **extra}
    return client.post("/api/lectures", data=data, files={"file": (name, content, "audio/mpeg")})


@pytest.fixture
def processed(client, course):
    """A lecture that has been uploaded and fully processed (background tasks run inside TestClient)."""
    resp = upload(client, course["id"])
    assert resp.status_code == 201, resp.text
    return client.get(f"/api/lectures/{resp.json()['id']}").json()
