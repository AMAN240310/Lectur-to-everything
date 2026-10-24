from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import worker
from .config import get_settings
from .db import ensure_indexes, get_db
from .routers import assignments, courses, dashboard, flashcards, lectures, search

log = logging.getLogger("lecture_to_everything")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_settings().ensure_dirs()
    try:
        db = get_db()
        await ensure_indexes(db)
        await worker.recover_interrupted(db)
    except Exception as exc:  # noqa: BLE001 - keep the API up so /api/health can explain the problem
        log.warning("MongoDB is not ready: %s", exc)
    yield


app = FastAPI(title="Lecture-to-Everything AI", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=get_settings().cors_origins, allow_methods=["*"], allow_headers=["*"],
)

api = APIRouter(prefix="/api")
for module in (courses, lectures, flashcards, assignments, search, dashboard):
    api.include_router(module.router)
app.include_router(api)

# Serve the built frontend (frontend/dist) from the same process when it exists.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if (DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        candidate = (DIST / full_path).resolve()
        if full_path and candidate.is_file() and DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
