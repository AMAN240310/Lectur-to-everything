# Testing documentation

## Running the tests

```bat
:: Backend (no MongoDB, Ollama, Whisper or FFmpeg needed)
cd backend
.venv\Scripts\activate
python -m pytest -v

:: Frontend
cd frontend
npm test            :: unit and component tests
npm run typecheck   :: TypeScript strict mode
npm run build       :: typecheck + production build
```

## Strategy

The expensive and non-deterministic parts (Whisper, Gemma, FFmpeg, MongoDB) are replaced in tests, so the full
pipeline runs in about a second and gives the same result every time.

| Real component | Test double |
|---|---|
| MongoDB | `mongomock-motor` (in-memory, async, same API as Motor) |
| Whisper | `fake_transcribe`: a six-segment Hinglish lecture with chit-chat, filler, a formula and an assignment |
| Gemma / Ollama | `FakeLLM`: reads the numbered segments out of the real prompt and answers with schema-shaped objects |
| FFmpeg | patched `prepare_wav` / `probe_duration` |

Tests go through the real FastAPI app with `TestClient`, so routing, validation, background processing, database
writes and responses are all exercised together.

## Backend coverage (47 tests)

| Requirement | What is checked | File |
|---|---|---|
| FR-01 | MP3/WAV/M4A accepted; other types, empty files, bad dates, bad languages, unknown courses rejected; duplicate recording rejected with a link to the original; audio served for playback; status and progress history; delete removes files and records | `test_pipeline.py` |
| FR-01 | Reprocess in all three modes; processing resumes without re-running Whisper | `test_pipeline.py` |
| FR-02 | Timestamps and original wording preserved; English terms kept inside Hinglish text; manual edits keep `original_text`; reverting clears the edited flag; empty edits rejected | `test_pipeline.py`, `test_study.py` |
| FR-03 | Casual chat and filler excluded, assignments never excluded; excluded segments restorable; user decisions survive re-filtering; transcript identical to Whisper output | `test_pipeline.py`, `test_study.py`, `test_units.py` |
| FR-04 | Concepts, formulas, examples, points, exam topics, Q&A, topics with end times; evidence and timestamps come from the real transcript; wrong segment indexes corrected; unmatched items flagged unverified; malformed model JSON tolerated | `test_pipeline.py`, `test_units.py` |
| FR-05 | Cards generated per topic; Leitner scheduling; known, difficult and reset; due filter; statistics | `test_study.py` |
| FR-06 | PDF is generated and downloads; refused before notes exist; Hindi text and `< > &` characters do not break it; regeneration after corrections | `test_study.py` |
| FR-07 | Dashboard counts and activity; search across transcript, notes, cards, assignments (regex characters treated literally); lecture filters; course CRUD and cascade delete rules; health endpoint | `test_study.py` |
| FR-08 | Reprocessing four times leaves the same number of cards and assignments; confirmed and dismissed assignments, card progress survive regeneration; unique indexes | `test_pipeline.py`, `test_study.py` |
| Errors | Ollama down: lecture is marked failed with a clear message and failed stage, transcript kept, retry succeeds; invalid model output degrades to a warning; silence produces a readable error | `test_pipeline.py` |

## Frontend coverage (25 tests)

| Area | What is checked |
|---|---|
| Formatting | Timestamps, durations, byte sizes, local-date parsing without timezone drift, "due in N days" labels, API error shapes |
| Flashcards | Answer hidden until revealed, known/difficult recorded, keyboard shortcuts (Space, 1, 2), session summary, restart |
| Calendar | Month navigation, Monday-first weeks, deadline markers, selection |
| Assignments | Confirm / dismiss / done actions, evidence and timestamp link shown, manual-only delete, missing date shown honestly |
| Upload | Disabled until a file is chosen, title pre-filled, all fields posted, wrong file types rejected, duplicate recording links to the existing lecture |

## Manual test checklist (needs the real models)

These need Whisper, Ollama and MongoDB, so they are not automated.

1. **Hinglish accuracy.** Upload a short Hinglish clip with *Hinglish* selected. Technical terms (for example
   "stack", "time complexity") should stay in English.
2. **Filtering.** Include a few sentences of small talk. Check they appear under *Excluded* and restore one.
3. **Deadline.** Say "assignment 2 is due next Monday". It should appear under *Needs review* with the quoted
   sentence and a working timestamp link.
4. **Correct and regenerate.** Edit a transcript line, press *Regenerate notes*, confirm the notes change and flashcard
   progress is kept.
5. **PDF.** Download it. Check Hindi text renders, headings are readable and deadlines are listed.
6. **Failure.** Stop Ollama, upload a clip. Expect a failed status with *Cannot reach Ollama*. Start Ollama and press
   *Try again*.
7. **Long recording.** Process a one-hour lecture. The page should show progress, and the UI should stay responsive.

## Known limits

- Output quality depends on the models. Small Gemma models can miss details or occasionally misread a deadline,
  which is why AI-detected tasks need confirmation and every item shows its evidence.
- Relative deadlines ("next Monday") are converted using the lecture date. If the model cannot work one out, the
  teacher's wording is kept and the date is left blank.
- Whisper has no speaker separation, so a teacher's and a student's speech are not distinguished.
- Processing is sequential: one lecture at a time.
