"""
Data-access layer. All Postgres I/O lives here.

Functions return plain dicts / dataclasses so handlers stay tidy.
"""
from __future__ import annotations

import json
from datetime import date
from typing import Any

from aiogram.types import User as TgUser

from .. import db
from .schedule_engine import OverrideDay, UserSchedule, Vacation


# ============================================================
# Users & chats
# ============================================================
async def upsert_user(user: TgUser, chat_id: int | None = None) -> None:
    async with db.conn() as c:
        await c.execute(
            """
            INSERT INTO users (id, username, first_name, last_name, language_code, is_premium)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
              username      = EXCLUDED.username,
              first_name    = EXCLUDED.first_name,
              last_name     = EXCLUDED.last_name,
              language_code = COALESCE(EXCLUDED.language_code, users.language_code),
              is_premium    = EXCLUDED.is_premium
            """,
            user.id,
            user.username,
            user.first_name or str(user.id),
            user.last_name,
            user.language_code or "ru",
            bool(getattr(user, "is_premium", False)),
        )
        if chat_id is not None:
            await c.execute(
                "INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                chat_id, user.id,
            )


async def ensure_chat(chat_id: int, title: str | None, primary: bool = False) -> None:
    async with db.conn() as c:
        await c.execute(
            """
            INSERT INTO chats (id, title, is_primary)
            VALUES ($1, $2, $3)
            ON CONFLICT (id) DO UPDATE SET
              title = COALESCE(EXCLUDED.title, chats.title),
              is_primary = chats.is_primary OR EXCLUDED.is_primary
            """,
            chat_id, title, primary,
        )


async def get_chat_user_ids(chat_id: int) -> list[int]:
    async with db.conn() as c:
        rows = await c.fetch("SELECT user_id FROM chat_members WHERE chat_id = $1", chat_id)
    return [r["user_id"] for r in rows]


async def get_primary_chat_id() -> int | None:
    async with db.conn() as c:
        return await c.fetchval("SELECT id FROM chats WHERE is_primary LIMIT 1")


# ============================================================
# Schedules
# ============================================================
async def fetch_schedule(user_id: int) -> UserSchedule | None:
    async with db.conn() as c:
        r = await c.fetchrow("SELECT * FROM schedules WHERE user_id = $1", user_id)
    if r is None:
        return None
    return UserSchedule(
        type=r["type"],
        work_days=r["work_days"],
        rest_days=r["rest_days"],
        weekly_mask=r["weekly_mask"],
        start_date=r["start_date"],
        respect_holidays=r["respect_holidays"],
    )


async def fetch_schedule_label(user_id: int) -> str | None:
    async with db.conn() as c:
        return await c.fetchval("SELECT label FROM schedules WHERE user_id = $1", user_id)


async def set_schedule_cycle(
    user_id: int,
    work: int,
    rest: int,
    start: date,
    respect_holidays: bool = True,
) -> None:
    label = f"{work}/{rest}"
    async with db.conn() as c:
        await c.execute(
            """
            INSERT INTO schedules
              (user_id, type, work_days, rest_days, start_date, respect_holidays, label)
            VALUES ($1, 'cycle', $2, $3, $4, $5, $6)
            ON CONFLICT (user_id) DO UPDATE SET
              type             = 'cycle',
              work_days        = $2,
              rest_days        = $3,
              weekly_mask      = NULL,
              start_date       = $4,
              respect_holidays = $5,
              label            = $6
            """,
            user_id, work, rest, start, respect_holidays, label,
        )


async def set_schedule_weekly(
    user_id: int,
    mask: int,
    respect_holidays: bool = True,
    label: str | None = None,
) -> None:
    async with db.conn() as c:
        await c.execute(
            """
            INSERT INTO schedules
              (user_id, type, weekly_mask, respect_holidays, label)
            VALUES ($1, 'weekly', $2, $3, $4)
            ON CONFLICT (user_id) DO UPDATE SET
              type             = 'weekly',
              weekly_mask      = $2,
              work_days        = NULL,
              rest_days        = NULL,
              start_date       = NULL,
              respect_holidays = $3,
              label            = $4
            """,
            user_id, mask, respect_holidays, label,
        )


async def set_schedule_unemployed(user_id: int) -> None:
    async with db.conn() as c:
        await c.execute(
            """
            INSERT INTO schedules (user_id, type, label)
            VALUES ($1, 'unemployed', 'безработный')
            ON CONFLICT (user_id) DO UPDATE SET
              type = 'unemployed', label = 'безработный'
            """,
            user_id,
        )


# ============================================================
# Overrides
# ============================================================
async def fetch_overrides(user_id: int, d_from: date, d_to: date) -> list[OverrideDay]:
    async with db.conn() as c:
        rows = await c.fetch(
            """
            SELECT date, is_work FROM schedule_overrides
            WHERE user_id = $1 AND date BETWEEN $2 AND $3
            """,
            user_id, d_from, d_to,
        )
    return [OverrideDay(r["date"], r["is_work"]) for r in rows]


async def upsert_override(user_id: int, d: date, is_work: bool, note: str | None = None) -> None:
    async with db.conn() as c:
        await c.execute(
            """
            INSERT INTO schedule_overrides (user_id, date, is_work, note)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, date) DO UPDATE SET
              is_work = EXCLUDED.is_work,
              note    = EXCLUDED.note
            """,
            user_id, d, is_work, note,
        )


async def delete_override(user_id: int, d: date) -> None:
    async with db.conn() as c:
        await c.execute(
            "DELETE FROM schedule_overrides WHERE user_id = $1 AND date = $2",
            user_id, d,
        )


# ============================================================
# Vacations
# ============================================================
async def fetch_vacations(user_id: int) -> list[Vacation]:
    async with db.conn() as c:
        rows = await c.fetch(
            "SELECT start_date, end_date FROM vacations WHERE user_id = $1",
            user_id,
        )
    return [Vacation(r["start_date"], r["end_date"]) for r in rows]


async def fetch_vacations_full(user_id: int) -> list[dict[str, Any]]:
    async with db.conn() as c:
        rows = await c.fetch(
            "SELECT id, start_date, end_date, label FROM vacations WHERE user_id = $1 ORDER BY start_date",
            user_id,
        )
    return [dict(r) for r in rows]


async def add_vacation(user_id: int, start: date, end: date, label: str | None = None) -> int:
    async with db.conn() as c:
        return await c.fetchval(
            """
            INSERT INTO vacations (user_id, start_date, end_date, label)
            VALUES ($1, $2, $3, $4) RETURNING id
            """,
            user_id, start, end, label,
        )


async def remove_vacation(user_id: int, vacation_id: int) -> bool:
    async with db.conn() as c:
        tag = await c.execute(
            "DELETE FROM vacations WHERE id = $1 AND user_id = $2",
            vacation_id, user_id,
        )
    return tag.endswith("1")


# ============================================================
# Gym
# ============================================================
DEFAULT_GYM_DAYS = {
    "1": {"label": "", "optional": False},    # Tue
    "3": {"label": "ноги", "optional": True}, # Thu
    "5": {"label": "", "optional": False},    # Sat
    "6": {"label": "", "optional": False},    # Sun
}


async def get_gym_plan(user_id: int) -> dict[str, Any] | None:
    async with db.conn() as c:
        r = await c.fetchrow("SELECT * FROM gym_plan WHERE user_id = $1", user_id)
    return dict(r) if r else None


async def set_gym_plan(
    user_id: int,
    enabled: bool,
    days: dict[str, Any] | None = None,
    evening_poll: bool = True,
    poll_hour: int = 20,
) -> None:
    if days is None:
        days = DEFAULT_GYM_DAYS
    async with db.conn() as c:
        await c.execute(
            """
            INSERT INTO gym_plan (user_id, enabled, days, evening_poll, poll_hour_msk)
            VALUES ($1, $2, $3::jsonb, $4, $5)
            ON CONFLICT (user_id) DO UPDATE SET
              enabled       = EXCLUDED.enabled,
              days          = EXCLUDED.days,
              evening_poll  = EXCLUDED.evening_poll,
              poll_hour_msk = EXCLUDED.poll_hour_msk
            """,
            user_id, enabled, json.dumps(days), evening_poll, poll_hour,
        )


async def toggle_gym(user_id: int) -> bool:
    current = await get_gym_plan(user_id)
    new_state = not (current and current["enabled"])
    await set_gym_plan(user_id, new_state)
    return new_state


async def get_gym_users_for_weekday(weekday: int) -> list[dict[str, Any]]:
    """Users whose gym plan includes given weekday (0=Mon..6=Sun)."""
    key = str(weekday)
    async with db.conn() as c:
        rows = await c.fetch(
            """
            SELECT u.id, u.first_name, u.username, g.days, g.evening_poll, g.poll_hour_msk
            FROM gym_plan g
            JOIN users u ON u.id = g.user_id
            WHERE g.enabled = true AND g.days ? $1
            """,
            key,
        )
    return [dict(r) for r in rows]


async def record_gym_attendance(user_id: int, d: date, going: bool | None) -> None:
    async with db.conn() as c:
        await c.execute(
            """
            INSERT INTO gym_attendance (user_id, date, going, responded_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (user_id, date) DO UPDATE SET
              going = EXCLUDED.going, responded_at = now()
            """,
            user_id, d, going,
        )


async def get_gym_attendance(d: date) -> dict[int, bool]:
    async with db.conn() as c:
        rows = await c.fetch(
            "SELECT user_id, going FROM gym_attendance WHERE date = $1 AND going IS NOT NULL",
            d,
        )
    return {r["user_id"]: r["going"] for r in rows}


# ============================================================
# Wide read: all users with their schedule info (joined)
# ============================================================
async def fetch_all_users_with_schedules() -> list[dict[str, Any]]:
    async with db.conn() as c:
        rows = await c.fetch(
            """
            SELECT u.id, u.first_name, u.username, u.photo_url,
                   s.type, s.work_days, s.rest_days, s.weekly_mask,
                   s.start_date, s.respect_holidays, s.label
            FROM users u
            LEFT JOIN schedules s ON s.user_id = u.id
            """,
        )
    return [dict(r) for r in rows]


async def fetch_overrides_on(d: date) -> dict[int, bool]:
    async with db.conn() as c:
        rows = await c.fetch(
            "SELECT user_id, is_work FROM schedule_overrides WHERE date = $1", d,
        )
    return {r["user_id"]: r["is_work"] for r in rows}


async def fetch_active_vacations_on(d: date) -> set[int]:
    async with db.conn() as c:
        rows = await c.fetch(
            "SELECT DISTINCT user_id FROM vacations WHERE start_date <= $1 AND end_date >= $1",
            d,
        )
    return {r["user_id"] for r in rows}


# ============================================================
# KV
# ============================================================
async def kv_get(key: str) -> Any:
    async with db.conn() as c:
        return await c.fetchval("SELECT value FROM kv WHERE key = $1", key)


async def kv_set(key: str, value: Any) -> None:
    async with db.conn() as c:
        await c.execute(
            """
            INSERT INTO kv (key, value) VALUES ($1, $2::jsonb)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """,
            key, json.dumps(value),
        )
