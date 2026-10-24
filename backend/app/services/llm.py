"""Thin client for a local Ollama server running a Gemma model."""
from __future__ import annotations

import json
import logging
import re
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from ..config import get_settings

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    pass


class LLMUnavailable(LLMError):
    """Ollama is unreachable or the model is missing: retrying immediately will not help."""


class LLMInvalid(LLMError):
    """The model answered, but not with usable structured output."""


def extract_json(raw: str) -> str:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object found in model output")
    return text[start : end + 1]


async def _chat(system: str, user: str) -> str:
    s = get_settings()
    payload = {
        "model": s.ollama_model,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2, "num_ctx": s.ollama_num_ctx},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=s.ollama_timeout) as client:
            resp = await client.post(f"{s.ollama_host}/api/chat", json=payload)
    except httpx.ConnectError as exc:
        raise LLMUnavailable(
            f"Cannot reach Ollama at {s.ollama_host}. Start Ollama and try again."
        ) from exc
    except httpx.TimeoutException as exc:
        raise LLMUnavailable("Ollama timed out. Try a smaller model or a shorter lecture.") from exc
    if resp.status_code == 404:
        raise LLMUnavailable(f"Model '{s.ollama_model}' is not installed. Run: ollama pull {s.ollama_model}")
    if resp.status_code >= 400:
        raise LLMUnavailable(f"Ollama returned HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json().get("message", {}).get("content", "")


async def chat_json(system: str, user: str, schema: type[T], *, retries: int = 2) -> T:
    """Ask the model for JSON and validate it against a Pydantic schema, retrying on bad output."""
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        prompt = user
        if last_error is not None:
            prompt += (
                "\n\nYour previous reply could not be used "
                f"({str(last_error)[:200]}). Reply again with ONLY the JSON object."
            )
        raw = await _chat(system, prompt)
        try:
            return schema.model_validate(json.loads(extract_json(raw)))
        except (ValueError, ValidationError) as exc:
            last_error = exc
            log.warning("LLM output invalid (attempt %d/%d): %s", attempt + 1, retries + 1, exc)
    raise LLMInvalid(f"Model did not return valid structured output: {last_error}")


async def check_ollama() -> dict:
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{s.ollama_host}/api/tags")
        names = [m.get("name", "") for m in resp.json().get("models", [])]
    except Exception as exc:  # noqa: BLE001 - health check must never raise
        return {"ok": False, "model": s.ollama_model, "model_available": False, "error": str(exc)[:160]}
    wanted = s.ollama_model
    available = any(n == wanted or n.startswith(wanted + ":") for n in names)
    return {"ok": True, "model": wanted, "model_available": available, "installed": names}
