"""
Compose today-view for the bot `/status` command.
Pulls users, schedules, overrides, vacations, holidays in as few queries as possible.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import NamedTuple

from . import calendar as calendar_svc
from . import queries
from .schedule_engine import OverrideDay, UserSchedule, Vacation, day_status, DayStatus


class UserDayView(NamedTuple):
    user_id: int
    name: str
    username: str | None
    label: str | None
    status: DayStatus


async def compute_day(d: date, user_ids: list[int] | None = None) -> list[UserDayView]:
    users = await queries.fetch_all_users_with_schedules()
    if user_ids is not None:
        allowed = set(user_ids)
        users = [u for u in users if u["id"] in allowed]

    holidays = await calendar_svc.load_holidays(d.year, d.year)
    overrides_today = await queries.fetch_overrides_on(d)
    on_vacation = await queries.fetch_active_vacations_on(d)

    result: list[UserDayView] = []
    for u in users:
        if u["type"] is None:
            sched = UserSchedule(type="unemployed")
        else:
            sched = UserSchedule(
                type=u["type"],
                work_days=u["work_days"],
                rest_days=u["rest_days"],
                weekly_mask=u["weekly_mask"],
                start_date=u["start_date"],
                respect_holidays=u["respect_holidays"],
            )
        ovrs = (
            [OverrideDay(d, overrides_today[u["id"]])]
            if u["id"] in overrides_today else []
        )
        vacs = [Vacation(d, d)] if u["id"] in on_vacation else []
        st = day_status(d, sched, ovrs, vacs, holidays)
        result.append(UserDayView(u["id"], u["first_name"], u["username"], u["label"], st))
    return result


async def find_next_common_off(today: date, horizon_days: int = 180) -> date | None:
    """First day within horizon where everyone with a schedule is off / on vacation / holiday."""
    from datetime import timedelta

    for i in range(horizon_days + 1):
        d = today + timedelta(days=i)
        views = await compute_day(d)
        has_any_schedule = any(v.status != "unemployed" for v in views)
        if not has_any_schedule:
            continue
        if all(v.status in ("rest", "vacation", "holiday", "unemployed") for v in views):
            return d
    return None
