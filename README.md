# Lecture-to-Everything AI

A local-first web app that turns a classroom recording into a transcript, filtered study notes, flashcards,
assignment deadlines and a downloadable PDF. Works with English, Hindi, Hinglish and other Whisper languages.

Everything runs on your computer. Whisper transcribes, Gemma (through Ollama) writes the study material,
MongoDB stores it. Nothing is sent to a cloud service. Internet is only needed once, to install things.

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

## 1. What you need

Install these once. After each one, run the check command. **If a check fails, fix it before moving on.**
Most setup problems come from skipping a check.

| Tool | How to get it | Check (in PowerShell) |
|---|---|---|
| Python 3.10 to 3.12 | python.org. Tick **Add python.exe to PATH** | `python --version` |
| Node.js 18+ | nodejs.org | `node --version` |
| FFmpeg | `winget install Gyan.FFmpeg` | `ffmpeg -version` (see the warning below) |
| MongoDB Community Server | mongodb.com/try/download/community. Install it **as a service** | `Get-Service MongoDB` should say *Running* |
| Ollama | ollama.com/download | `ollama --version` |
| NVIDIA GPU (optional) | Up-to-date NVIDIA driver | `nvidia-smi` shows your card |

> **FFmpeg warning.** After `winget install`, the window you ran it in does **not** know about FFmpeg yet
> ("restart your shell to use the new value"). Close that window and open a new PowerShell before
> running `ffmpeg -version`. If a new window still says *not recognized*, see
> [FFmpeg is not found](#ffmpeg-is-not-found) below.

---

## 2. One-time setup

Open PowerShell and go to the project folder (the one containing `backend` and `frontend`).

### 2.1 Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
```

If PowerShell says *running scripts is disabled on this system*, allow scripts for this window only and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.venv\Scripts\activate
```

You should now see `(.venv)` at the start of the prompt. Then:

```powershell
pip install -r requirements-dev.txt
copy .env.example .env
```

`pip install` is a **large download** (several GB) because Whisper needs PyTorch. Let it finish.

### 2.2 Gemma model

```powershell
ollama pull gemma3:4b
ollama list
```

`ollama list` must show `gemma3:4b`. Ollama must be running (look for its icon near the clock; start it from the Start menu if not).

### 2.3 Frontend

```powershell
cd ..\frontend
npm install
npm run build
```

### 2.4 Check that the code works

```powershell
cd ..\backend
python -m pytest
```

Everything should pass. These tests use fakes for Whisper, Gemma and MongoDB, so a pass proves the
code is fine but **not** that your real tools are installed. The status pill in the app (below) checks those.

Whisper downloads its speech model the first time it is used (about 460 MB for `small`). Models are kept in
`C:\Users\<you>\.cache\whisper`, so this happens once.

---

## 3. Start the app (every time)

1. Make sure **MongoDB** and **Ollama** are running (checks in section 1).
2. Open a **new** PowerShell window and run:

```powershell
cd D:\path\to\project\backend
.venv\Scripts\activate
ffmpeg -version
```

3. If `ffmpeg -version` prints a version line, start the backend:

```powershell
python -m uvicorn app.main:app
```

4. Open <http://localhost:8000>. The backend serves the built frontend, so this is the only process you need.

5. Click the **status pill** at the top right. It lists MongoDB, Ollama, FFmpeg and Whisper and says what to fix.

**Keep that PowerShell window open while a lecture is processing.** Closing it, or stopping the server,
kills the job, and the lecture then needs *Reprocess* (see Troubleshooting).

> Do not add `--reload` for normal use. With `--reload`, saving any `.py` file restarts the server and kills
> a lecture that is being processed.

### Development mode (hot reload)

```powershell
# window 1
cd backend; .venv\Scripts\activate; python -m uvicorn app.main:app --reload
# window 2
cd frontend; npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to the backend. If the browser or the Vite window shows
`ECONNREFUSED 127.0.0.1:8000`, the backend is not running.

---

## 4. Try your first lecture

1. **Courses → New course** (for example "Data Structures").
2. **Upload lecture**. Use a **short clip (1 to 2 minutes)** the first time.
3. Pick the spoken language:
   - Everything in English: **English** or **Auto-detect**.
   - Hindi and English mixed: **Hinglish**. Technical words then stay in English.
   - Do not force a language that is not what is spoken. A wrong language can garble the transcript.
4. Watch the progress. What to expect:

| Stage | What it means | Normal behaviour |
|---|---|---|
| Queued, Preparing audio | FFmpeg converts the file | A few seconds |
| Transcribing with Whisper | Speech to text | **The bar stays at 8% until it finishes.** This is normal. It can take minutes on a CPU |
| Filtering | Marks small talk and filler | Quick |
| Extracting | Gemma writes notes, concepts, deadlines, questions | Slower on small GPUs and CPUs |
| Ready | Done | Open the tabs: Overview, Transcript, Notes, Flashcards, Assignments |

To see whether it is really working during transcription: open Task Manager → Details and look at the `python.exe` rows. One of them using a lot of CPU or GPU means it is working.

---

## 5. Make it faster: use your NVIDIA GPU

On Windows, `pip install openai-whisper` normally installs a **CPU-only** PyTorch, so Whisper ignores your GPU. The
warning `FP16 is not supported on CPU; using FP32 instead` in the backend log is the sign. Check:

```powershell
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
```

If it prints `False`, install the CUDA build (get the exact command for your driver from
pytorch.org/get-started/locally: Stable → Windows → Pip → CUDA):

```powershell
pip uninstall torch -y
pip install torch --index-url https://download.pytorch.org/whl/cu124
python -c "import torch; print(torch.cuda.is_available())"
```

It should print `True`. Restart the backend afterwards. The app needs no setting change: `LTE_WHISPER_DEVICE=auto` uses the GPU as soon as PyTorch can see it.

**Small GPUs (4 GB, like a laptop RTX 3050):**
- `small` Whisper fits. `medium` and `large` do not.
- `gemma3:4b` plus its context may not fit entirely. Run `ollama ps` after a lecture: a CPU/GPU split in the PROCESSOR column means it spilled onto the CPU and notes will be slow. Fixes: `LTE_OLLAMA_NUM_CTX=4096`, or `LTE_OLLAMA_MODEL=gemma3:1b` (then `ollama pull gemma3:1b`).

**Other ways to cut time:**
- `LTE_WHISPER_MODEL=base` is about three times faster than `small`, with less accurate Hindi.
- Test with short clips. A one-hour lecture is a long background job on any laptop.

---

## 6. Settings (`backend\.env`)

All settings start with `LTE_`. Restart the backend after changing them.

| Setting | Default | Notes |
|---|---|---|
| `LTE_WHISPER_MODEL` | `small` | `tiny`, `base`, `small`, `medium`, `large-v3`. Bigger is slower and more accurate |
| `LTE_WHISPER_DEVICE` | `auto` | `auto`, `cpu` or `cuda`. See section 5 |
| `LTE_OLLAMA_MODEL` | `gemma3:4b` | `gemma3:12b` writes better notes if you have the memory. `gemma3:1b` is the lightest |
| `LTE_OLLAMA_NUM_CTX` | `8192` | Smaller uses less GPU memory |
| `LTE_NOTES_LANGUAGE` | `English` | Language the notes are written in |
| `LTE_MONGO_URI` | `mongodb://localhost:27017` | Change only for a remote or authenticated MongoDB |
| `LTE_STORAGE_DIR` | `backend/storage` | Where audio and PDFs are kept |
| `LTE_PDF_FONT` | auto | Path to a `.ttf` font. Windows uses Nirmala UI, so Devanagari prints correctly |

---

## 7. Troubleshooting

### FFmpeg is not found

Symptoms: the lecture fails with **FFmpeg was not found on PATH**, the status pill says FFmpeg is missing, or a Whisper
test prints `FileNotFoundError: [WinError 2]`. (Whisper starts `ffmpeg` itself, so the same problem shows up there.)

1. Close **every** PowerShell window and open a new one. Run `ffmpeg -version`.
2. If it still says *not recognized*, find the install and add it to PATH **for the window that starts the backend**:

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffmpeg.exe | Select-Object -First 1 FullName
```

Copy the folder part (ending in `\bin`; do not include `ffmpeg.exe`). The path has spaces, so keep the quotes:

```powershell
$env:Path = "C:\Users\YourName\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_...\ffmpeg-9.0.2-full_build\bin;" + $env:Path
ffmpeg -version
```

If `ffmpeg -version` prints a version, start the backend **in that same window**. You must repeat the `$env:Path` line in every new window.

3. To make it permanent: Windows key → **Edit the system environment variables** → **Environment Variables** → select **Path** under *User variables* → **Edit** → **New** → paste the `\bin` folder → OK on every window. Open a new PowerShell. (If it still fails, restart Windows once.)

### Other problems

| Symptom | Cause and fix |
|---|---|
| `running scripts is disabled on this system` when activating the venv | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`, then activate again |
| Status pill: *MongoDB is not reachable* | Start the MongoDB service: `Start-Service MongoDB` (or `services.msc`) |
| Status pill: *Ollama is not running* | Start Ollama from the Start menu, then check `ollama list` |
| *Model is not installed* | `ollama pull gemma3:4b` (or the model named in `LTE_OLLAMA_MODEL`) |
| Status pill: Whisper not installed | In the activated venv: `pip install openai-whisper` |
| Page says *Transcribing* at 8% for a long time | Normal during Whisper, the bar cannot move. Check Task Manager for `python.exe` CPU use. If **no** `python.exe` is running, the backend was closed and the job is dead: start the backend, open the lecture, choose **Reprocess → Re-transcribe everything** |
| Lecture stuck as *Transcribing* after the backend restarted | The backend marks interrupted lectures as failed on startup. Open it and use **Try again** / **Reprocess** |
| `FP16 is not supported on CPU` in the log | PyTorch is the CPU build, so your GPU is unused. See section 5 |
| Whisper is very slow | Use the GPU (section 5), or `LTE_WHISPER_MODEL=base` |
| Notes are very slow | Gemma is probably partly on the CPU: `ollama ps`. Use `gemma3:1b` or `LTE_OLLAMA_NUM_CTX=4096` |
| Transcript is garbled or in the wrong language | You forced a language that is not spoken. Choose **Auto-detect**, then **Reprocess → Re-transcribe everything** |
| Hindi words in Devanagari but you want Roman letters | Choose **Hinglish** when uploading |
| `ECONNREFUSED 127.0.0.1:8000` in the browser or Vite window | The backend is not running. Start it (section 3) |
| `Address already in use` / port 8000 busy | Another backend is still running. Close it, or use `--port 8001` (and update the Vite proxy if using dev mode) |
| Upload says the recording already exists | The same file was uploaded to this course before. The message links to it |
| PDF shows `?` for Hindi text | Set `LTE_PDF_FONT=C:/Windows/Fonts/Nirmala.ttf` |
| `pip install` fails or takes very long | PyTorch is a multi-GB download. Check your connection and retry. Use Python 3.10 to 3.12 |
| Unsure whether the real tools work | Process a 1 to 2 minute clip and read the status pill. `pytest` only tests the code, not your installs |

---

## 8. How it works

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
quoted evidence are copied from the real transcript, so evidence cannot be invented. If the model gives a bad
segment number, the item is matched by word overlap, and if nothing matches it is saved as unverified.

**The original transcript is never lost.** Filtering only flags segments. You can review every exclusion and restore
it. Your decisions always win over later automatic filtering. Manual corrections keep the original Whisper wording.

**Assignments are safe by design.** Anything mentioning assignments, exams, deadlines or submissions is never
filtered out, in English, Hinglish or Devanagari. AI-found tasks start as *Needs review* until you confirm them.

**No duplicate records.** Unique MongoDB indexes plus upserts make retries and reprocessing idempotent. Flashcard
progress, confirmed or edited assignments and dismissed suggestions survive regeneration. The same recording
cannot be uploaded twice into one course.

**Failures are visible.** Every lecture records its status, progress, processing log, failed stage and error
message. A failed run keeps the transcript, so *Try again* does not repeat the slow Whisper step.

### Reprocessing modes

| Mode | Re-transcribes | Re-filters | Re-extracts | Use when |
|---|---|---|---|---|
| Regenerate notes only | no | no | yes | You corrected the transcript or restored segments |
| Re-filter and regenerate | no | yes | yes | Filtering looked wrong |
| Re-transcribe everything | yes | yes | yes | Different Whisper model or language, or the job died. **Replaces manual corrections** |

---

## 9. Features by requirement

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

**MongoDB collections:** `courses`, `lectures`, `transcripts`, `studyMaterials`, `flashcards`, `assignments`. Every generated record carries
`lecture_id` and `course_id`, plus `start` (seconds) and an `evidence` excerpt where applicable. Audio and PDFs live in
`backend/storage/audio` and `backend/storage/pdfs`.

**API docs:** <http://localhost:8000/docs> while the backend runs.

---

## 10. Testing

See [docs/TESTING.md](docs/TESTING.md).

```powershell
cd backend; .venv\Scripts\activate; python -m pytest
cd frontend; npm test
```

---

## 11. Optional: speed update

If you have applied the speed update (its tests make the backend suite 65 tests instead of 47), these extra settings in
`backend\.env` exist. They do nothing in older versions.

| Setting | Default | Notes |
|---|---|---|
| `LTE_FFMPEG_DIR` | auto | Folder containing `ffmpeg.exe`. The backend also searches `backend\ffmpeg\bin`, the PATH and the winget folder, and gives Whisper the path, so no PATH editing is needed |
| `LTE_FILTER_MODE` | `combined` | `combined`: Gemma reads the transcript once (fastest AI option). `llm`: separate filtering pass (slowest). `rules`: no AI, instant |
| `LTE_WHISPER_FAST` | `true` | One decode per window instead of up to six retries. Set `false` if phrases get skipped |
| `LTE_WHISPER_UNLOAD_AFTER` | `true` | Frees Whisper's GPU/RAM after transcribing so Gemma has room |
| `LTE_OLLAMA_KEEP_ALIVE` | `30m` | Keeps Gemma loaded between calls |

With it, the status pill also shows whether Whisper is on the **GPU or CPU**, and the lecture's *Processing log* shows how long each stage took.