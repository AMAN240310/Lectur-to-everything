"""Study-notes PDF generation with ReportLab."""
from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..config import get_settings
from ..utils import fmt_ts

ACCENT = colors.HexColor("#C9792B")
INK = colors.HexColor("#1F1B16")
MUTED = colors.HexColor("#7A7066")
WASH = colors.HexColor("#F6EFE6")

_fonts: tuple[str, str] | None = None
_unicode = False


def _register_fonts() -> tuple[str, str]:
    """Prefer a Unicode TrueType font (Nirmala UI on Windows, DejaVu on Linux)."""
    global _fonts, _unicode
    if _fonts is not None:
        return _fonts
    s = get_settings()
    candidates: list[tuple[str, str | None]] = []
    if s.pdf_font:
        candidates.append((s.pdf_font, None))
    candidates += [
        ("C:/Windows/Fonts/Nirmala.ttf", "C:/Windows/Fonts/NirmalaB.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/Library/Fonts/Arial Unicode.ttf", None),
    ]
    for regular, bold in candidates:
        if not Path(regular).exists():
            continue
        try:
            pdfmetrics.registerFont(TTFont("LTE", regular))
            bold_path = bold if bold and Path(bold).exists() else regular
            pdfmetrics.registerFont(TTFont("LTE-Bold", bold_path))
            registerFontFamily("LTE", normal="LTE", bold="LTE-Bold", italic="LTE", boldItalic="LTE-Bold")
            _fonts, _unicode = ("LTE", "LTE-Bold"), True
            return _fonts
        except Exception:  # noqa: BLE001 - try the next candidate
            continue
    _fonts, _unicode = ("Helvetica", "Helvetica-Bold"), False
    return _fonts


def _t(text: str | None) -> str:
    text = text or ""
    if not _unicode:
        text = text.encode("latin-1", "replace").decode("latin-1")
    return escape(text)


def _styles(base: str, bold: str) -> dict[str, ParagraphStyle]:
    return {
        "title": ParagraphStyle("title", fontName=bold, fontSize=22, leading=27, textColor=INK, spaceAfter=4),
        "meta": ParagraphStyle("meta", fontName=base, fontSize=9.5, leading=13, textColor=MUTED, spaceAfter=10),
        "h1": ParagraphStyle("h1", fontName=bold, fontSize=14, leading=18, textColor=ACCENT, spaceBefore=14, spaceAfter=6),
        "h2": ParagraphStyle("h2", fontName=bold, fontSize=11, leading=15, textColor=INK, spaceBefore=8, spaceAfter=3),
        "body": ParagraphStyle("body", fontName=base, fontSize=10, leading=14.5, textColor=INK, alignment=TA_LEFT, spaceAfter=3),
        "bullet": ParagraphStyle("bullet", fontName=base, fontSize=10, leading=14, textColor=INK, leftIndent=12, bulletIndent=2, spaceAfter=2),
        "formula": ParagraphStyle("formula", fontName=bold, fontSize=10.5, leading=15, textColor=INK, backColor=WASH, borderPadding=(5, 6, 5, 6), spaceBefore=4, spaceAfter=8),
        "cell": ParagraphStyle("cell", fontName=base, fontSize=9, leading=12, textColor=INK),
        "cellb": ParagraphStyle("cellb", fontName=bold, fontSize=9, leading=12, textColor=INK),
    }


def _ts(item: dict) -> str:
    start = item.get("start")
    return f' <font color="#7A7066" size="8">[{fmt_ts(start)}]</font>' if start is not None else ""


def build_notes_pdf(lecture: dict, course: dict | None, materials: dict, assignments: list[dict], out: Path) -> Path:
    base, bold = _register_fonts()
    st = _styles(base, bold)
    out.parent.mkdir(parents=True, exist_ok=True)

    def footer(canvas, doc):  # noqa: ANN001
        canvas.saveState()
        canvas.setFont(base, 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(20 * mm, 12 * mm, _t_plain(lecture.get("title", "")))
        canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        str(out), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=20 * mm,
        title=lecture.get("title", "Lecture notes"), author="Lecture-to-Everything AI",
    )
    story: list = []

    meta_bits = [
        (course or {}).get("name"), lecture.get("subject"), lecture.get("date"),
        f"{fmt_ts(lecture['duration_sec'])} long" if lecture.get("duration_sec") else None,
        f"language: {lecture['detected_language']}" if lecture.get("detected_language") else None,
    ]
    story += [
        Paragraph(_t(lecture.get("title", "Lecture notes")), st["title"]),
        Paragraph(_t("  ·  ".join(str(b) for b in meta_bits if b)), st["meta"]),
    ]

    def section(title: str) -> None:
        story.append(Paragraph(_t(title), st["h1"]))

    def bullets(items: list[str]) -> None:
        for it in items:
            story.append(Paragraph(it, st["bullet"], bulletText="•"))

    if materials.get("summary"):
        section("Summary")
        story.append(Paragraph(_t(materials["summary"]), st["body"]))

    if materials.get("topics"):
        section("Topics covered")
        rows = [[Paragraph("Time", st["cellb"]), Paragraph("Topic", st["cellb"])]]
        for t in materials["topics"]:
            text = f"<b>{_t(t['title'])}</b>" + (f"<br/>{_t(t.get('summary'))}" if t.get("summary") else "")
            rows.append([Paragraph(fmt_ts(t["start"]), st["cell"]), Paragraph(text, st["cell"])])
        story.append(_table(rows, [22 * mm, 148 * mm]))

    if materials.get("detailed_notes"):
        section("Detailed notes")
        for sec in materials["detailed_notes"]:
            block = [Paragraph(_t(sec["heading"]) + _ts(sec), st["h2"])]
            block += [Paragraph(_t(b), st["bullet"], bulletText="•") for b in sec["bullets"]]
            story.append(KeepTogether(block))

    if materials.get("concepts"):
        section("Key concepts and definitions")
        for c in materials["concepts"]:
            story.append(Paragraph(f"<b>{_t(c['term'])}</b> — {_t(c['definition'])}{_ts(c)}", st["body"]))

    if materials.get("formulas"):
        section("Formulas")
        for f in materials["formulas"]:
            story.append(Paragraph(_t(f["expression"]), st["formula"]))
            if f.get("meaning"):
                story.append(Paragraph(_t(f["meaning"]) + _ts(f), st["body"]))

    if materials.get("examples"):
        section("Examples")
        for e in materials["examples"]:
            head = f"<b>{_t(e['title'])}</b>: " if e.get("title") else ""
            story.append(Paragraph(head + _t(e["description"]) + _ts(e), st["body"]))

    if materials.get("important_points"):
        section("Important points")
        bullets([_t(p["text"]) + _ts(p) for p in materials["important_points"]])

    if materials.get("exam_topics"):
        section("Likely exam topics")
        bullets([_t(x["topic"]) + _ts(x) for x in materials["exam_topics"]])

    if assignments:
        section("Assignments and deadlines")
        rows = [[Paragraph(h, st["cellb"]) for h in ("Task", "Type", "Due", "Status")]]
        for a in assignments:
            due = a.get("due_date") or a.get("deadline_text") or "—"
            rows.append([
                Paragraph(f"<b>{_t(a['title'])}</b>" + (f"<br/>{_t(a.get('description'))}" if a.get("description") else ""), st["cell"]),
                Paragraph(_t(a.get("kind", "")), st["cell"]),
                Paragraph(_t(due), st["cell"]),
                Paragraph(_t(a.get("status", "")), st["cell"]),
            ])
        story.append(_table(rows, [80 * mm, 25 * mm, 38 * mm, 27 * mm]))

    if materials.get("qa"):
        section("Revision questions")
        for i, q in enumerate(materials["qa"], 1):
            story.append(KeepTogether([
                Paragraph(f"<b>Q{i}. {_t(q['question'])}</b>", st["body"]),
                Paragraph(f"A. {_t(q['answer'])}{_ts(q)}", st["bullet"]),
                Spacer(1, 3),
            ]))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return out


def _t_plain(text: str) -> str:
    return text if _unicode else text.encode("latin-1", "replace").decode("latin-1")


def _table(rows: list[list], widths: list[float]) -> Table:
    table = Table(rows, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), WASH),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2D8CB")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table
