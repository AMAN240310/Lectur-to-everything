@echo off
REM One-time setup for Windows. Run from the project root in a normal Command Prompt.
setlocal
echo === Lecture-to-Everything AI: setup ===

where python >nul 2>nul || (echo Python 3.10+ not found. Install it from python.org and tick "Add to PATH". & exit /b 1)
where node   >nul 2>nul || (echo Node.js 18+ not found. Install it from nodejs.org. & exit /b 1)
where ffmpeg >nul 2>nul || (echo FFmpeg not found. Run: winget install Gyan.FFmpeg   then reopen this window. & exit /b 1)

echo.
echo [1/3] Backend virtual environment and packages (Whisper pulls in PyTorch, this is a big download)...
cd backend
if not exist .venv python -m venv .venv || exit /b 1
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip || exit /b 1
pip install -r requirements-dev.txt || exit /b 1
if not exist .env copy .env.example .env >nul
cd ..

echo.
echo [2/3] Frontend packages and build...
cd frontend
call npm install || exit /b 1
call npm run build || exit /b 1
cd ..

echo.
echo [3/3] Gemma model via Ollama...
where ollama >nul 2>nul && (ollama pull gemma3:4b) || echo Ollama not found. Install it from ollama.com, then run: ollama pull gemma3:4b

echo.
echo Setup finished. Start the app with start-windows.bat
