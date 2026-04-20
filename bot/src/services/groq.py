import json
from typing import Any

import httpx

from .. import config

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


async def complete(
    system: str,
    user: str,
    *,
    json_mode: bool = False,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> str:
    if not config.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set")

    payload: dict[str, Any] = {
        "model": config.GROQ_MODEL,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=45) as client:
        r = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
            json=payload,
        )
        r.raise_for_status()
        data = r.json()
    return data["choices"][0]["message"]["content"]


async def json_complete(system: str, user: str, **kw: Any) -> dict[str, Any]:
    raw = await complete(system, user, json_mode=True, **kw)
    return json.loads(raw)
