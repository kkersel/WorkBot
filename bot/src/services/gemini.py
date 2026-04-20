"""
Gemini client (Google AI Studio API).
Used as the primary AI for invites / place suggestions when GEMINI_API_KEY is set.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from .. import config

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent?key={key}"
)
DEFAULT_MODEL = "gemini-2.5-flash"


def available() -> bool:
    return bool(config.GEMINI_API_KEY)


async def complete(
    system: str,
    user: str,
    *,
    json_mode: bool = False,
    temperature: float = 0.8,
    max_tokens: int = 1024,
    model: str = DEFAULT_MODEL,
    use_search: bool = False,
) -> str:
    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set")

    payload: dict[str, Any] = {
        "systemInstruction": {"role": "system", "parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if json_mode:
        payload["generationConfig"]["responseMimeType"] = "application/json"
    if use_search:
        payload["tools"] = [{"google_search": {}}]

    url = GEMINI_URL.format(model=model, key=config.GEMINI_API_KEY)
    async with httpx.AsyncClient(timeout=45) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()

    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"Gemini returned no candidates: {data}")
    parts = candidates[0].get("content", {}).get("parts") or []
    return "".join(p.get("text", "") for p in parts)


async def json_complete(system: str, user: str, **kw: Any) -> dict[str, Any]:
    raw = await complete(system, user, json_mode=True, **kw)
    return json.loads(raw)
