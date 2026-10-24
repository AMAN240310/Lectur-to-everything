"""FR-02/03 review, FR-05 flashcards, FR-06 PDF, FR-07 dashboard/search, assignments & courses."""
from __future__ import annotations

from .conftest import upload


# ------------------------------------------------------------------ transcript review (FR-02, FR-03)


def test_restore_excluded_segment_and_regenerate(client, processed):
    lid = processed["id"]
    base = f"/api/lectures/{lid}/transcript/segments"

    seg = client.patch(f"{base}/0", json={"excluded": False}).json()
    assert seg["excluded"] is False and seg["user_override"] is True and seg["reason"] == "Restored by you"
    assert client.get(f"/api/lectures/{lid}").json()["materials_stale"] is True

    # the restore survives a full re-filter
    client.post(f"/api/lectures/{lid}/reprocess", json={"mode": "content"})
    segs = client.get(f"/api/lectures/{lid}/transcript").json()["segments"]
    assert segs[0]["excluded"] is False
    assert client.get(f"/api/lectures/{lid}").json()["materials_stale"] is False


def test_manual_correction_keeps_original_wording(client, processed):
    lid = processed["id"]
    url = f"/api/lectures/{lid}/transcript/segments/1"
    seg = client.patch(url, json={"text": "aaj hum stack padhenge, stack LIFO hota hai"}).json()
    assert seg["edited"] is True and seg["original_text"].startswith("aaj hum stack data structure")
    # editing back to the original clears the edited flag
    assert client.patch(url, json={"text": seg["original_text"]}).json()["edited"] is False
    assert client.patch(url, json={"text": "   "}).status_code == 422
    assert client.patch(f"/api/lectures/{lid}/transcript/segments/99", json={"text": "x"}).status_code == 404


def test_manual_exclusion(client, processed):
    lid = processed["id"]
    seg = client.patch(f"/api/lectures/{lid}/transcript/segments/2", json={"excluded": True}).json()
    assert seg["excluded"] and seg["reason"] == "Excluded by you"


def test_regenerate_after_correction_keeps_progress_and_confirmations(client, processed):
    lid = processed["id"]
    card = client.get(f"/api/flashcards?lecture_id={lid}").json()[0]
    client.post(f"/api/flashcards/{card['id']}/review", json={"result": "known"})
    assignment = client.get(f"/api/assignments?lecture_id={lid}").json()[0]
    client.patch(f"/api/assignments/{assignment['id']}", json={"status": "confirmed", "due_date": "2026-10-28"})

    client.patch(f"/api/lectures/{lid}/transcript/segments/1", json={"text": "corrected text about LIFO stack"})
    assert client.post(f"/api/lectures/{lid}/regenerate").status_code == 202

    cards = client.get(f"/api/flashcards?lecture_id={lid}").json()
    same = next(c for c in cards if c["id"] == card["id"])
    assert same["status"] == "known" and same["review_count"] == 1
    kept = client.get(f"/api/assignments?lecture_id={lid}").json()
    assert len(kept) == 1 and kept[0]["status"] == "confirmed" and kept[0]["due_date"] == "2026-10-28"


# ------------------------------------------------------------------ flashcards (FR-05)


def test_flashcard_review_flow(client, processed):
    lid = processed["id"]
    stats = client.get(f"/api/flashcards/stats?lecture_id={lid}").json()
    assert stats["total"] == stats["new"] == stats["due"] and stats["topics"] == ["Stack basics"]

    card = client.get(f"/api/flashcards?lecture_id={lid}").json()[0]
    known = client.post(f"/api/flashcards/{card['id']}/review", json={"result": "known"}).json()
    assert known["status"] == "known" and known["box"] == 1 and known["review_count"] == 1
    assert known["next_review"] > known["last_reviewed"]  # scheduled for later

    again = client.post(f"/api/flashcards/{card['id']}/review", json={"result": "known"}).json()
    assert again["box"] == 2

    hard = client.post(f"/api/flashcards/{card['id']}/review", json={"result": "difficult"}).json()
    assert hard["status"] == "difficult" and hard["box"] == 0 and hard["review_count"] == 3

    stats = client.get(f"/api/flashcards/stats?lecture_id={lid}").json()
    assert stats["difficult"] == 1 and stats["new"] == stats["total"] - 1

    assert len(client.get(f"/api/flashcards?lecture_id={lid}&status=difficult").json()) == 1
    assert len(client.get(f"/api/flashcards?lecture_id={lid}&topic=Nope").json()) == 0
    due_ids = {c["id"] for c in client.get(f"/api/flashcards?lecture_id={lid}&due=true").json()}
    assert card["id"] in due_ids  # difficult cards come straight back

    reset = client.post(f"/api/flashcards/{card['id']}/review", json={"result": "reset"}).json()
    assert reset["status"] == "new" and reset["next_review"] is None
    assert client.post("/api/flashcards/nope/review", json={"result": "known"}).status_code == 404


def test_known_card_is_not_due_until_later(client, processed):
    lid = processed["id"]
    card = client.get(f"/api/flashcards?lecture_id={lid}").json()[0]
    client.post(f"/api/flashcards/{card['id']}/review", json={"result": "known"})
    due_ids = {c["id"] for c in client.get(f"/api/flashcards?lecture_id={lid}&due=true").json()}
    assert card["id"] not in due_ids


# ------------------------------------------------------------------ assignments


def test_assignment_management(client, processed):
    lid = processed["id"]
    manual = client.post("/api/assignments", json={"lecture_id": lid, "title": "Read chapter 4", "kind": "reading",
                                                    "due_date": "2026-11-02"}).json()
    assert manual["status"] == "confirmed" and manual["source"] == "manual" and manual["course_name"]
    assert client.post("/api/assignments", json={"title": "x", "due_date": "soon"}).status_code == 422
    assert client.patch(f"/api/assignments/{manual['id']}", json={"due_date": "31/12"}).status_code == 422

    items = client.get("/api/assignments").json()
    assert [a["due_date"] for a in items] == ["2026-10-26", "2026-11-02"]  # sorted by due date

    ai = items[0]
    client.patch(f"/api/assignments/{ai['id']}", json={"status": "dismissed"})
    assert len(client.get("/api/assignments").json()) == 1
    assert len(client.get("/api/assignments?include_dismissed=true").json()) == 2

    # a dismissed suggestion stays dismissed after regeneration (no duplicate comes back)
    client.post(f"/api/lectures/{lid}/regenerate")
    all_items = client.get("/api/assignments?include_dismissed=true").json()
    assert len(all_items) == 2
    assert next(a for a in all_items if a["id"] == ai["id"])["status"] == "dismissed"

    assert client.delete(f"/api/assignments/{manual['id']}").status_code == 204
    assert client.delete(f"/api/assignments/{manual['id']}").status_code == 404


# ------------------------------------------------------------------ PDF (FR-06)


def test_notes_pdf_download(client, processed):
    resp = client.get(f"/api/lectures/{processed['id']}/notes.pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF") and len(resp.content) > 1500
    assert "stacks-notes.pdf" in resp.headers["content-disposition"]


def test_pdf_requires_generated_notes(client, course, fake_llm):
    from app.services import llm
    fake_llm.error = llm.LLMUnavailable("down")
    lid = upload(client, course["id"]).json()["id"]
    assert client.get(f"/api/lectures/{lid}/notes.pdf").status_code == 409


def test_pdf_handles_hindi_and_markup_characters(tmp_path):
    from app.services import pdf
    materials = {"summary": "आज हम <stack> & queue पढ़ेंगे", "topics": [], "detailed_notes": [],
                 "concepts": [{"term": "A<B", "definition": "x & y", "start": 3.0}], "formulas": [], "examples": [],
                 "important_points": [], "exam_topics": [], "qa": []}
    out = pdf.build_notes_pdf({"title": "Test <&> title", "subject": "CS", "date": "2026-10-19"}, None, materials, [],
                              tmp_path / "x.pdf")
    assert out.read_bytes().startswith(b"%PDF")


# ------------------------------------------------------------------ search & dashboard (FR-07)


def test_search_across_transcript_notes_and_cards(client, processed):
    hits = client.get("/api/search?q=lifo").json()
    kinds = {r["type"] for r in hits["results"]}
    assert {"transcript", "concept", "flashcard"} <= kinds
    transcript_hit = next(r for r in hits["results"] if r["type"] == "transcript")
    assert transcript_hit["lecture_id"] == processed["id"] and transcript_hit["start"] == 5.0
    assert client.get("/api/search?q=stacks").json()["results"][0]["type"] == "lecture"
    assert client.get("/api/search?q=zzzzzz").json()["total"] == 0
    assert client.get("/api/search?q=a").status_code == 422
    # regex characters in the query are treated literally
    assert client.get("/api/search?q=O(1)").json()["total"] >= 1


def test_dashboard_summary(client, processed):
    d = client.get("/api/dashboard").json()
    assert d["counts"]["courses"] == 1 and d["counts"]["lectures"] == 1 and d["counts"]["completed"] == 1
    assert d["counts"]["flashcards"] > 0 and d["counts"]["flashcards_due"] == d["counts"]["flashcards"]
    assert d["recent_lectures"][0]["course_name"] == "Data Structures"
    assert d["activity"][0]["lecture_title"] == "Stacks"
    assert "history" not in d["recent_lectures"][0]


def test_lecture_list_filters(client, course, processed):
    assert len(client.get(f"/api/lectures?course_id={course['id']}").json()) == 1
    assert client.get("/api/lectures?course_id=other").json() == []
    assert len(client.get("/api/lectures?status=completed").json()) == 1
    assert client.get("/api/lectures?status=failed").json() == []


# ------------------------------------------------------------------ courses


def test_course_crud_and_delete_rules(client):
    c = client.post("/api/courses", json={"name": "Maths", "semester": "1"}).json()
    assert client.post("/api/courses", json={"name": "Maths", "semester": "1"}).status_code == 409
    assert client.post("/api/courses", json={"name": "Maths", "semester": "2"}).status_code == 201
    assert client.post("/api/courses", json={"name": ""}).status_code == 422

    assert client.patch(f"/api/courses/{c['id']}", json={"instructor": "Dr Rao"}).json()["instructor"] == "Dr Rao"
    assert client.get("/api/courses/nope").status_code == 404

    lid = upload(client, c["id"]).json()["id"]
    assert client.get(f"/api/courses/{c['id']}").json()["lecture_count"] == 1
    assert client.delete(f"/api/courses/{c['id']}").status_code == 409
    assert client.delete(f"/api/courses/{c['id']}?cascade=true").status_code == 204
    assert client.get(f"/api/lectures/{lid}").status_code == 404
    assert client.get(f"/api/assignments").json() == []


def test_health_endpoint_reports_each_dependency(client):
    h = client.get("/api/health").json()
    assert set(h) == {"mongo", "ollama", "ffmpeg", "whisper"}
    assert h["ollama"]["ok"] in (True, False)
