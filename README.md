# Lecture-to-Everything AI

A local-first web app that turns a classroom recording into a transcript, filtered study notes, flashcards,
assignment deadlines and a downloadable PDF. Works with English, Hindi, Hinglish and other Whisper languages.

Everything runs on your computer. Whisper transcribes, Gemma (through Ollama) writes the study material,
MongoDB stores it. Nothing is sent to a cloud service.

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS (Vite) |
| Backend | Python + FastAPI |
| Speech recognition | OpenAI Whisper (local `openai-whisper` package) |
| Language model | Gemma through Ollama (default `gemma3:4b`) |
| Database | MongoDB (Motor driver) |
| Validation | Pydantic |
| PDF | ReportLab |
| Audio | FFmpeg |
| Files | Local filesystem (`backend/storage`) |
| Tests | Pytest, Vitest + Testing Library |

---

## Windows setup

### 1. Install the prerequisites

| Tool | Where | Check |
|---|---|---|
| Python 3.10 – 3.12 | python.org (tick **Add python.exe to PATH**) | `python --version` |
| Node.js 18+ | nodejs.org | `node --version` |
| FFmpeg | `winget install Gyan.FFmpeg` (reopen the terminal afterwards) | `ffmpeg -version` |
| MongoDB Community Server | mongodb.com/try/download/community (install as a service) | service **MongoDB Server** is running |
| Ollama | ollama.com/download | `ollama --version` |

### 2. Run the setup script

In Command Prompt, from this folder:

```bat
setup-windows.bat
```

It creates a Python virtual environment, installs the backend packages (this includes PyTorch for Whisper, a
multi-gigabyte download), installs and builds the frontend, and pulls the Gemma model. If you prefer to do it by
hand:

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env

cd ..\frontend
npm install
npm run build

ollama pull gemma3:4b
```

Whisper downloads its speech model (`small`, about 460 MB) the first time you process a lecture.

### 3. Start the app

```bat
start-windows.bat
```

Open <http://localhost:8000>. The backend serves the built frontend, so this is the only process you need.
Ollama and MongoDB must be running (both normally start automatically after installation).

The status pill at the top right shows which local services are ready and what to fix if one is not.

### Development mode (hot reload)

```bat
:: terminal 1
cd backend && .venv\Scripts\activate && python -m uvicorn app.main:app --reload
:: terminal 2
cd frontend && npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to the backend.

---

## Choosing models

Edit `backend/.env` (all settings are prefixed `LTE_`).

| Setting | Default | Notes |
|---|---|---|
| `LTE_WHISPER_MODEL` | `small` | `base` is faster, `medium` or `large-v3` are far more accurate for Hinglish but need a GPU or lots of patience |
| `LTE_WHISPER_DEVICE` | `auto` | Uses CUDA when PyTorch can see an NVIDIA GPU |
| `LTE_OLLAMA_MODEL` | `gemma3:4b` | `gemma3:12b` writes better notes if you have 16 GB+ RAM or a good GPU |
| `LTE_OLLAMA_NUM_CTX` | `8192` | Context window passed to Ollama |
| `LTE_NOTES_LANGUAGE` | `English` | Language the generated notes are written in |
| `LTE_PDF_FONT` | auto | Path to a `.ttf` file. Windows uses Nirmala UI automatically, so Devanagari prints correctly |

Rough expectations: a one-hour lecture takes minutes on a CUDA GPU and well over an hour on a CPU-only laptop
(`LTE_WHISPER_MODEL=base` helps). Only one lecture is processed at a time so the machine is not overloaded.

---

## How it works

```
Upload (MP3/WAV/M4A)
  └─ FFmpeg decodes to 16 kHz mono
      └─ Whisper → timestamped segments            (status: transcribing)
          └─ Filter: rules + Gemma classify each segment as
          │   academic / admin / casual / filler     (status: filtering)
          └─ Gemma extracts, per chunk of transcript (status: extracting)
              summary · topics · notes · concepts · formulas · examples
              important points · exam topics · assignments · Q&A
              └─ Saved to MongoDB, flashcards derived  (status: completed)
```

**Evidence links.** The model only reports *which transcript segment* an item came from. The timestamp and the
quoted evidence are then copied from the real transcript, so evidence cannot be invented. If the model gives a bad
segment number, the item is matched by word overlap, and if nothing matches it is saved as unverified.

**The original transcript is never lost.** Filtering only flags segments (`excluded`, `category`, `reason`). You can
review every exclusion and restore it. Your decisions (restores, manual exclusions) always win over later
automatic filtering. Manual text corrections keep the original Whisper wording next to them.

**Assignments are safe by design.** Anything mentioning assignments, exams, deadlines or submissions is never
filtered out, in English, Hinglish or Devanagari. AI-found tasks start as *Needs review* until you confirm them.

**No duplicate records.** Unique MongoDB indexes plus upserts make retries and reprocessing idempotent. Flashcard
progress, confirmed or edited assignments and dismissed suggestions survive regeneration. The same recording
cannot be uploaded twice into one course (SHA-256 check).

**Failures are visible.** Every lecture records its status, progress, processing log, failed stage and error
message. A failed run keeps the transcript, so *Try again* does not repeat the expensive Whisper step. Lectures left
mid-processing by a crash are marked failed at the next start.

### Reprocessing modes

| Mode | Re-transcribes | Re-filters | Re-extracts | Use when |
|---|---|---|---|---|
| Regenerate notes only | no | no | yes | You corrected the transcript or restored segments |
| Re-filter and regenerate | no | yes | yes | Filtering looked wrong |
| Re-transcribe everything | yes | yes | yes | You want a different Whisper model. **Replaces manual corrections** |

---

## Features by requirement

| ID | Where to find it |
|---|---|
| FR-01 Lecture management | Upload dialog, lecture header (status, progress, processing log, *Reprocess*, audio player at the bottom) |
| FR-02 Transcription | Lecture → Transcript (timestamps, click to seek, edit, revert to original wording) |
| FR-03 Content filtering | Lecture → Transcript → *Excluded* view, *Restore* button |
| FR-04 AI extraction | Lecture → Overview (summary, topic timeline, exam topics, important points) and Notes (notes, concepts, formulas, examples, revision Q&A) |
| FR-05 Flashcards | Flashcards page and lecture tab. Reveal, then *Known* / *Difficult*. Leitner schedule (1, 2, 4, 8, 16, 32 days) |
| FR-06 Notes and PDF | Lecture → Notes → *Download PDF*, *Regenerate notes* |
| FR-07 Dashboard | Dashboard, Courses, Lectures, Assignments (calendar), global search |
| FR-08 Persistence | MongoDB collections below |

### MongoDB collections

`courses`, `lectures`, `transcripts`, `studyMaterials`, `flashcards`, `assignments`. Every generated record carries
`lecture_id` and `course_id`, plus `start` (seconds) and an `evidence` excerpt where applicable. Audio and PDFs live in
`backend/storage/audio` and `backend/storage/pdfs`.

### API

FastAPI serves interactive docs at <http://localhost:8000/docs>.

---

## Testing

See [docs/TESTING.md](docs/TESTING.md).

```bat
cd backend && .venv\Scripts\activate && python -m pytest
cd frontend && npm test
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Status pill says *MongoDB is not reachable* | Start the **MongoDB Server** service (`services.msc`) |
| *Cannot reach Ollama* / *Model is not installed* | Start Ollama, then `ollama pull gemma3:4b` |
| *FFmpeg was not found on PATH* | `winget install Gyan.FFmpeg`, then open a new terminal |
| Whisper is very slow | Use `LTE_WHISPER_MODEL=base`, or install the CUDA build of PyTorch if you have an NVIDIA GPU |
| Hindi words come out in Devanagari but you want Roman script | Choose **Hinglish** as the spoken language when uploading |
| Notes are shallow or miss details | Use a larger Gemma (`gemma3:12b`) and set `LTE_OLLAMA_MODEL` |
| PDF shows `?` for Hindi text | Set `LTE_PDF_FONT` to a Unicode font such as `C:/Windows/Fonts/Nirmala.ttf` |
| Upload says the recording already exists | The same file was uploaded to this course before. The message links to it |
