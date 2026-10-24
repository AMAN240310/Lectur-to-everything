"""Pydantic models: API inputs and validation of structured LLM output.

LLM output models are deliberately lenient: small local models often return nulls,
numbers-as-strings or slightly malformed list items. Bad items are dropped instead of
failing the whole lecture.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

# --------------------------------------------------------------------------- API inputs


class CourseIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = ""
    subject: str = ""
    semester: str = ""
    instructor: str = ""
    description: str = ""


class CoursePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = None
    subject: str | None = None
    semester: str | None = None
    instructor: str | None = None
    description: str | None = None


class SegmentPatch(BaseModel):
    text: str | None = None
    excluded: bool | None = None


class ReprocessIn(BaseModel):
    # full: re-transcribe + filter + extract (overwrites manual transcript corrections)
    # content: keep transcript, re-run filtering + extraction
    # extract: keep transcript and current include/exclude choices, re-run extraction only
    mode: Literal["full", "content", "extract"] = "content"


class ReviewIn(BaseModel):
    result: Literal["known", "difficult", "reset"]


AssignmentKind = Literal["assignment", "exam", "deadline", "instruction", "reading"]
AssignmentStatus = Literal["suggested", "confirmed", "done", "dismissed"]


class AssignmentIn(BaseModel):
    lecture_id: str | None = None
    course_id: str | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    kind: AssignmentKind = "assignment"
    due_date: str | None = None  # YYYY-MM-DD


class AssignmentPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    kind: AssignmentKind | None = None
    due_date: str | None = None
    status: AssignmentStatus | None = None


# --------------------------------------------------------------------------- LLM output


def _int_or_none(v: Any) -> int | None:
    if v is None or isinstance(v, bool):
        return None
    try:
        return int(float(str(v).strip().strip("[]")))
    except (ValueError, TypeError):
        return None


class Lenient(BaseModel):
    model_config = ConfigDict(extra="ignore", coerce_numbers_to_str=True)

    @model_validator(mode="before")
    @classmethod
    def _drop_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if v is not None}
        return data


class Located(Lenient):
    seg: int | None = None

    @field_validator("seg", mode="before")
    @classmethod
    def _seg(cls, v: Any) -> int | None:
        return _int_or_none(v)


class ConceptOut(Located):
    term: str
    definition: str


class FormulaOut(Located):
    expression: str
    meaning: str = ""


class ExampleOut(Located):
    title: str = ""
    description: str


class PointOut(Located):
    text: str


class ExamTopicOut(Located):
    topic: str


class QAOut(Located):
    question: str
    answer: str


class AssignmentOut(Located):
    title: str
    description: str = ""
    kind: AssignmentKind = "assignment"
    deadline_text: str = ""
    due_date: str | None = None

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, v: Any) -> str:
        v = str(v or "").strip().lower()
        return v if v in {"assignment", "exam", "deadline", "instruction", "reading"} else "assignment"


class TopicOut(Located):
    title: str
    summary: str = ""


class NoteSectionOut(Located):
    heading: str
    bullets: list[str] = []


_LISTS: dict[str, type[Lenient]] = {
    "topics": TopicOut,
    "notes": NoteSectionOut,
    "concepts": ConceptOut,
    "formulas": FormulaOut,
    "examples": ExampleOut,
    "important_points": PointOut,
    "exam_topics": ExamTopicOut,
    "assignments": AssignmentOut,
    "qa": QAOut,
}
_STRING_KEYS = {"exam_topics": "topic", "important_points": "text"}


class ChunkExtraction(Lenient):
    summary: str = ""
    topics: list[TopicOut] = []
    notes: list[NoteSectionOut] = []
    concepts: list[ConceptOut] = []
    formulas: list[FormulaOut] = []
    examples: list[ExampleOut] = []
    important_points: list[PointOut] = []
    exam_topics: list[ExamTopicOut] = []
    assignments: list[AssignmentOut] = []
    qa: list[QAOut] = []

    @model_validator(mode="before")
    @classmethod
    def _lenient_lists(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        for name, model in _LISTS.items():
            raw = out.get(name)
            if raw is None:
                out.pop(name, None)
                continue
            if not isinstance(raw, list):
                out[name] = []
                continue
            items = []
            for item in raw:
                if isinstance(item, str) and name in _STRING_KEYS:
                    item = {_STRING_KEYS[name]: item}
                try:
                    items.append(model.model_validate(item))
                except ValidationError:
                    continue
            out[name] = items
        return out


class SummaryOut(Lenient):
    summary: str


class NonAcademicItem(Lenient):
    i: int
    label: Literal["casual", "filler", "admin"] = "casual"
    reason: str = ""

    @field_validator("label", mode="before")
    @classmethod
    def _label(cls, v: Any) -> str:
        v = str(v or "").strip().lower()
        return v if v in {"casual", "filler", "admin"} else "casual"


class ClassifyOut(Lenient):
    non_academic: list[NonAcademicItem] = []

    @model_validator(mode="before")
    @classmethod
    def _lenient(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        raw = data.get("non_academic")
        if not isinstance(raw, list):
            return {"non_academic": []}
        items = []
        for item in raw:
            try:
                items.append(NonAcademicItem.model_validate(item))
            except ValidationError:
                continue
        return {"non_academic": items}
