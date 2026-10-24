"""Unit tests for the pure helpers: filtering rules, JSON handling, chunking, evidence matching."""
from __future__ import annotations

import pytest

from app.schemas import ChunkExtraction, ClassifyOut
from app.services import extraction, filtering, llm
from app.utils import fmt_ts, key_for, norm


@pytest.mark.parametrize("text", [
    "assignment number 3 submit karna hai", "kal tak jama kar dena", "next week quiz hoga",
    "अगले हफ्ते टेस्ट है", "deadline is Friday", "this will come in the exam", "Homework dekh lena",
])
def test_admin_content_is_always_recognised(text):
    assert filtering.is_admin(text)


@pytest.mark.parametrize("text", ["stack ek LIFO structure hai", "the derivative of x squared", "dedicated server"])
def test_teaching_content_is_not_admin(text):
    assert not filtering.is_admin(text)


def test_filler_detection():
    assert filtering.is_filler("hmm okay") and filtering.is_filler("") and filtering.is_filler("Haan, haan!")
    assert not filtering.is_filler("okay so stacks are LIFO")


def test_user_override_is_never_reclassified():
    import asyncio
    segs = [{"idx": 0, "start": 0, "end": 1, "text": "hmm", "user_override": True, "excluded": False, "category": "academic"}]
    out, _ = asyncio.run(filtering.classify_segments(segs))
    assert out[0]["excluded"] is False


def test_extract_json_handles_fences_and_chatter():
    assert llm.extract_json('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert llm.extract_json('Sure! Here you go: {"a": {"b": 2}} hope it helps') == '{"a": {"b": 2}}'
    with pytest.raises(ValueError):
        llm.extract_json("no json here")


def test_lenient_schema_drops_bad_items_and_coerces_types():
    res = ChunkExtraction.model_validate({
        "summary": None,
        "concepts": [{"term": "Stack", "definition": "LIFO", "seg": "[7]"}, {"term": "no definition"}, "junk"],
        "qa": "not a list",
        "important_points": ["a plain string"],
        "assignments": [{"title": "HW", "kind": "Homework!!"}],
        "formulas": [{"expression": 42, "meaning": None}],
    })
    assert [c.seg for c in res.concepts] == [7] and len(res.concepts) == 1
    assert res.qa == [] and res.important_points[0].text == "a plain string"
    assert res.assignments[0].kind == "assignment" and res.formulas[0].expression == "42"
    assert ClassifyOut.model_validate({"non_academic": [{"i": "3", "label": "weird"}, {"label": "x"}]}).non_academic[0].label == "casual"
    assert ClassifyOut.model_validate({"non_academic": None}).non_academic == []


def seg(i, text, start=None):
    start = float(i * 10 if start is None else start)
    return {"idx": i, "start": start, "end": start + 9, "text": text}


def test_chunking_respects_size_and_keeps_order():
    segs = [seg(i, "x" * 400) for i in range(10)]
    chunks = extraction.build_chunks(segs, 1000)
    assert [s["idx"] for c in chunks for s in c] == list(range(10)) and all(len(c) <= 3 for c in chunks)


def test_locate_trusts_valid_index_else_matches_by_overlap():
    chunk = [seg(0, "welcome to class"), seg(1, "binary search halves the sorted array each step")]
    assert extraction.locate(0, "anything", chunk)["idx"] == 0
    assert extraction.locate(99, "binary search halves array", chunk)["idx"] == 1  # wrong index corrected
    assert extraction.locate(None, "quantum chromodynamics", chunk) is None  # no invented evidence
    assert extraction.evidence(None)["verified"] is False


def test_evidence_comes_from_the_transcript_not_the_model():
    ev = extraction.evidence(seg(4, "word " * 100, start=61.0))
    assert ev["start"] == 61.0 and len(ev["evidence"]) <= 280 and ev["evidence"].endswith("…")


def test_stable_keys_and_normalisation():
    assert key_for("What is a Stack?") == key_for("  what is a stack ")
    assert key_for("a") != key_for("b")
    assert "ि" in norm("हिंदी, पढ़ाई!")  # Devanagari vowel signs survive normalisation
    assert fmt_ts(75) == "1:15" and fmt_ts(3725) == "1:02:05" and fmt_ts(None) == "0:00"


def test_flashcard_topic_assignment():
    materials = {
        "topics": [{"title": "Intro", "start": 0}, {"title": "Queues", "start": 100}],
        "qa": [{"question": "Q1?", "answer": "A", "start": 10, "evidence": ""}],
        "concepts": [{"term": "Queue", "definition": "FIFO", "start": 120, "evidence": ""}],
        "formulas": [{"expression": "x", "meaning": "", "start": 5}],  # no meaning -> no card
    }
    cards = {c["question"]: c for c in extraction.build_flashcards(materials)}
    assert cards["Q1?"]["topic"] == "Intro" and cards["What is Queue?"]["topic"] == "Queues" and len(cards) == 2
