"""
Daily / periodic jobs:
  - Evening gym poll — asks each enabled user if they're going today.
  - Calendar sync — refreshes Russian production calendar for current & next year.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .. import config
from . import calendar as calendar_svc
from . import queries
from .status_view import compute_day
from .schedule_engine import UserSchedule

log = logging.getLogger(__name__)
MSK = ZoneInfo(config.TZ)


async def run_evening_gym_poll(bot: Bot, hour_msk: int) -> None:
    """Runs every hour; sends a poll to users whose poll_hour_msk matches current hour."""
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
    from .. import texts

    today = datetime.now(MSK).date()
    weekday = today.weekday()
    users = await queries.get_gym_users_for_weekday(weekday)

    # Filter to those whose poll_hour matches AND who are resting today
    todays_views = await compute_day(today)
    status_by_user = {v.user_id: v.status for v in todays_views}

    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ иду", callback_data=f"gym:yes:{today.isoformat()}"),
        InlineKeyboardButton(text="❌ слив", callback_data=f"gym:no:{today.isoformat()}"),
    ]])

    for u in users:
        if u.get("poll_hour_msk") != hour_msk:
            continue
        if not u.get("evening_poll"):
            continue
        if status_by_user.get(u["id"]) == "work":
            continue  # working → no point asking

        day_entry = (u.get("days") or {}).get(str(weekday), {}) or {}
        label = day_entry.get("label") or ""
        greeting = texts.pick(texts.GYM_POLL, name=u["first_name"])
        if label:
            greeting += f"\n<i>тема: {label}</i>"
        try:
            await bot.send_message(u["id"], greeting, reply_markup=kb)
        except Exception as e:
            log.warning("failed to send gym poll to %s: %s", u["id"], e)


async def run_calendar_sync() -> None:
    now = datetime.now(MSK)
    for y in (now.year, now.year + 1):
        try:
            await calendar_svc.sync_year(y)
        except Exception as e:
            log.warning("calendar sync for %s failed: %s", y, e)


def start_scheduler(bot: Bot) -> AsyncIOScheduler:
    sched = AsyncIOScheduler(timezone=MSK)

    # Hourly check: at minute 0 send gym polls for users whose poll_hour == current hour
    for hour in range(24):
        sched.add_job(
            run_evening_gym_poll,
            CronTrigger(hour=hour, minute=0, timezone=MSK),
            args=[bot, hour],
            id=f"gym_poll_{hour}",
            misfire_grace_time=300,
        )

    # Calendar sync once a week on Monday 03:10
    sched.add_job(
        run_calendar_sync,
        CronTrigger(day_of_week="mon", hour=3, minute=10, timezone=MSK),
        id="calendar_sync",
    )

    # Also at boot (best-effort)
    sched.add_job(run_calendar_sync, "date", run_date=datetime.now(MSK))

    sched.start()
    log.info("scheduler started")
    return sched


def stop_scheduler(sched: AsyncIOScheduler) -> None:
    if sched.running:
        sched.shutdown(wait=False)
