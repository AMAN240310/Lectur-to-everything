"""FR-01 .. FR-04 and FR-08: upload, transcription, filtering, extraction, persistence."""
from __future__ import annotations

from app.services import llm

from .conftest import FAKE_SEGMENTS, upload


def test_upload_runs_whole_pipeline(client, processed):
    lec = processed
    assert lec["status"] == "completed" and lec["progress"] == 100
    assert lec["detected_language"] == "hi"
    assert lec["duration_sec"] == 45.0
    stages = [h["stage"] for h in lec["history"]]
    assert stages[:2] == ["uploaded", "queued"] and "transcribing" in stages and stages[-1] == "completed"


def test_transcript_preserves_original_and_flags_noise(client, processed):
    tr = client.get(f"/api/lectures/{processed['id']}/transcript").json()
    segs = tr["segments"]
    assert [s["original_text"] for s in segs] == [t for _, _, t in FAKE_SEGMENTS]  # nothing lost
    assert segs[0]["excluded"] and segs[0]["category"] == "casual"  # weather chat (LLM)
    assert segs[3]["excluded"] and segs[3]["category"] == "filler"  # "haha okay okay" (heuristic)
    assert not segs[4]["excluded"] and segs[4]["category"] == "admin"  # assignment is always kept
    assert segs[1]["start"] == 5.0 and segs[1]["end"] == 14.0  # timestamps preserved
    assert "LIFO" in segs[1]["text"]  # English technical terms retained in Hinglish


def test_materials_are_evidence_linked_to_real_transcript(client, processed):
    mats = client.get(f"/api/lectures/{processed['id']}/materials").json()
    concept = mats["concepts"][0]
    assert concept["term"] == "Stack"
    assert concept["start"] == 5.0 and "LIFO" in concept["evidence"] and concept["verified"]
    assert mats["formulas"][0]["start"] == 14.0
    topic = mats["topics"][0]
    assert topic["title"] == "Stack basics" and topic["start"] == 5.0 and topic["end"] == 45.0
    assert mats["exam_topics"][0]["topic"] == "Stack operations"  # plain string coerced
    assert mats["summary"] and mats["detailed_notes"] and mats["qa"]


def test_assignments_extracted_with_deadline_and_evidence(client, processed):
    items = client.get(f"/api/assignments?lecture_id={processed['id']}").json()
    assert len(items) == 1
    a = items[0]
    assert a["title"] == "Assignment 3" and a["due_date"] == "2026-10-26"
    assert a["status"] == "suggested" and "assignment number 3" in a["evidence"]
    assert a["lecture_title"] == "Stacks" and a["course_name"] == "Data Structures"


def test_flashcards_generated_and_grouped_by_topic(client, processed):
    cards = client.get(f"/api/flashcards?lecture_id={processed['id']}").json()
    questions = {c["question"] for c in cards}
    assert {"What is a stack?", "What is Stack?"} <= questions
    assert any(c["type"] == "formula" for c in cards)
    assert all(c["topic"] == "Stack basics" for c in cards)
    assert all(c["status"] == "new" and c["course_id"] == processed["course_id"] for c in cards)


def test_reprocessing_never_duplicates_records(client, processed):
    lid = processed["id"]

    def counts():
        return (
            len(client.get(f"/api/flashcards?lecture_id={lid}").json()),
            len(client.get(f"/api/assignments?lecture_id={lid}").json()),
        )

    before = counts()
    for mode in ("full", "content", "extract", "extract"):
        assert client.post(f"/api/lectures/{lid}/reprocess", json={"mode": mode}).status_code == 202
        assert client.get(f"/api/lectures/{lid}").json()["status"] == "completed"
        assert counts() == before
    assert len(client.get("/api/lectures").json()) == 1


def test_duplicate_upload_is_rejected(client, course, processed):
    resp = upload(client, course["id"])
    assert resp.status_code == 409
    assert resp.json()["detail"]["lecture_id"] == processed["id"]
    assert len(client.get("/api/lectures").json()) == 1
    # a different recording is fine
    assert upload(client, course["id"], content=b"different-bytes", title="Queues").status_code == 201


def test_upload_validation(client, course):
    assert upload(client, course["id"], name="notes.txt").status_code == 415
    assert upload(client, course["id"], content=b"").status_code == 422
    assert upload(client, "missing-course").status_code == 404
    assert upload(client, course["id"], language="not a language!").status_code == 422
    assert upload(client, course["id"], date="19/10/2026").status_code == 422
    for ext in (".wav", ".m4a"):
        assert upload(client, course["id"], content=ext.encode() * 4, name=f"x{ext}").status_code == 201


def test_audio_is_served_for_playback(client, processed):
    resp = client.get(f"/api/lectures/{processed['id']}/audio")
    assert resp.status_code == 200 and resp.content == b"fake-audio-bytes-1"
    assert resp.headers["content-type"] == "audio/mpeg"


def test_failure_is_recorded_then_recoverable(client, course, fake_llm):
    fake_llm.error = llm.LLMUnavailable("Cannot reach Ollama at http://localhost:11434. Start Ollama and try again.")
    lec = client.get(f"/api/lectures/{upload(client, course['id']).json()['id']}").json()
    assert lec["status"] == "failed" and "Ollama" in lec["error"] and lec["failed_stage"] == "filtering"
    # transcript survived the failure, so reprocessing does not need to re-run Whisper
    assert len(client.get(f"/api/lectures/{lec['id']}/transcript").json()["segments"]) == 6

    fake_llm.error = None
    client.post(f"/api/lectures/{lec['id']}/reprocess", json={"mode": "content"})
    again = client.get(f"/api/lectures/{lec['id']}").json()
    assert again["status"] == "completed" and again["error"] is None and again["attempts"] == 2


def test_invalid_model_output_degrades_gracefully(client, course, fake_llm):
    """A model that cannot produce JSON for filtering must not lose the lecture."""
    original = fake_llm.__call__

    async def flaky(system, user, schema, **kw):
        if schema.__name__ == "ClassifyOut":
            raise llm.LLMInvalid("bad json")
        return await original(system, user, schema, **kw)

    import app.services.llm as llm_mod
    llm_mod.chat_json = flaky  # monkeypatch fixture restores the original at teardown
    lec = client.get(f"/api/lectures/{upload(client, course['id']).json()['id']}").json()
    assert lec["status"] == "completed"
    assert any("Filtering skipped" in w for w in lec["warnings"])
    segs = client.get(f"/api/lectures/{lec['id']}/transcript").json()["segments"]
    assert not segs[0]["excluded"]  # kept, not lost


def test_missing_audio_or_empty_speech_reports_clear_error(client, course, monkeypatch):
    from app.services import transcription
    monkeypatch.setattr(transcription, "transcribe_file", lambda *a, **k: {"language": "en", "duration": 0, "segments": []})
    lec = client.get(f"/api/lectures/{upload(client, course['id']).json()['id']}").json()
    assert lec["status"] == "failed" and "No speech" in lec["error"]


def test_delete_lecture_removes_everything(client, processed, tmp_path):
    lid = processed["id"]
    assert client.delete(f"/api/lectures/{lid}").status_code == 204
    assert client.get(f"/api/lectures/{lid}").status_code == 404
    assert client.get(f"/api/flashcards?lecture_id={lid}").json() == []
    assert client.get(f"/api/assignments?lecture_id={lid}").json() == []
    assert not list((tmp_path / "storage" / "audio").glob("*"))
