"""
AI-backed invite generation via Groq (default) / Gemini (optional).

Prompts Llama to suggest a concrete place in Moscow for the given activity,
returning structured JSON we can show inline.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from .. import config
from . import gemini, groq

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты — шокобургер, ассистент компании друзей из Москвы.
Твоя задача — подсказать КОНКРЕТНОЕ заведение в Москве под запрос.
Тон: неформальный, дружеский, русский язык, сленг ок, без канцелярита.
Отвечай ТОЛЬКО валидным JSON без комментариев.

Формат ответа:
{
  "kind": "pool|bar|restaurant|coffee|bowling|karaoke|cinema|custom",
  "place_name": "название заведения",
  "address": "улица, дом, метро",
  "price_range": "примерный чек, например '1500-2500 ₽/чел'",
  "why": "1-2 неформальных предложения почему именно сюда",
  "booking_hint": "как забронировать (телефон/сайт/2gis)",
  "url": "ссылка (2gis, yandex, или сайт заведения)",
  "phone": "+7..."
}

Если информации нет — поставь null. Но place_name и address должны быть всегда.
Предпочитай популярные и проверенные места, не секретки.
"""


async def suggest_place(kind: str, user_hint: str | None = None) -> dict[str, Any]:
    """
    kind: short category string like 'пул', 'бар', 'кофе'
    user_hint: optional free-form prompt from user (vibe, price range, area)
    """
    user_message = f"Запрос: {kind}."
    if user_hint:
        user_message += f"\nУточнения: {user_hint}"
    user_message += "\nГород: Москва. Количество человек: до 10. Сегодня или ближайшие выходные."

    # Prefer Gemini (better knowledge of Moscow venues + optional grounding).
    # Fall back to Groq/Llama if Gemini not configured.
    try:
        if gemini.available():
            data = await gemini.json_complete(
                SYSTEM_PROMPT, user_message,
                temperature=0.8, max_tokens=800, use_search=True,
            )
        else:
            raw = await groq.complete(
                SYSTEM_PROMPT, user_message,
                json_mode=True, temperature=0.8, max_tokens=600,
            )
            data = json.loads(raw)
    except (json.JSONDecodeError, KeyError) as e:
        log.warning("AI JSON parse failed: %s", e)
        raise

    # Fill defaults so downstream never KeyErrors
    for k in ("place_name", "address", "price_range", "why", "booking_hint", "url", "phone", "kind"):
        data.setdefault(k, None)
    return data


def format_invite_card(data: dict[str, Any], inviter_name: str, kind_label: str) -> str:
    """Format a place suggestion as an HTML message for Telegram."""
    lines = [
        f"🎉 <b>{inviter_name}</b> зовёт на <b>{kind_label}</b>!",
        "",
        f"📍 <b>{data.get('place_name') or '???'}</b>",
    ]
    if data.get("address"):
        lines.append(f"   {data['address']}")
    if data.get("price_range"):
        lines.append(f"💰 {data['price_range']}")
    if data.get("why"):
        lines.append("")
        lines.append(f"<i>{data['why']}</i>")
    if data.get("phone"):
        lines.append("")
        lines.append(f"☎️ <code>{data['phone']}</code>")
    if data.get("booking_hint"):
        lines.append(f"📝 {data['booking_hint']}")
    lines.append("")
    lines.append("кто идёт?")
    return "\n".join(lines)
