from dataclasses import dataclass
from datetime import date
from typing import Literal

DayStatus = Literal["work", "rest", "vacation", "holiday", "unemployed"]
ScheduleType = Literal["cycle", "weekly", "custom", "unemployed"]


@dataclass(frozen=True)
class UserSchedule:
    type: ScheduleType
    work_days: int | None = None
    rest_days: int | None = None
    weekly_mask: int | None = None          # bit 0 = Mon ... bit 6 = Sun
    start_date: date | None = None
    respect_holidays: bool = True


@dataclass(frozen=True)
class OverrideDay:
    date: date
    is_work: bool


@dataclass(frozen=True)
class Vacation:
    start_date: date
    end_date: date


def _in_vacation(d: date, vacations: list[Vacation]) -> bool:
    return any(v.start_date <= d <= v.end_date for v in vacations)


def day_status(
    d: date,
    schedule: UserSchedule,
    overrides: list[OverrideDay],
    vacations: list[Vacation],
    holidays: dict[date, int],
) -> DayStatus:
    """
    Determine what the user is doing on date `d`.

    Priority (highest first):
      1. vacation
      2. holiday (if respect_holidays)   — day_type 1 in xmlcalendar
      3. per-day override
      4. base schedule (cycle / weekly / unemployed)

    Holidays semantics:
      day_type 1 — non-working (suppresses work)
      day_type 3 — "moved" working Sat/Sun (only affects weekly schedules)
    """
    if _in_vacation(d, vacations):
        return "vacation"

    holiday_type = holidays.get(d)
    if schedule.respect_holidays and holiday_type == 1:
        return "holiday"

    for o in overrides:
        if o.date == d:
            return "work" if o.is_work else "rest"

    if schedule.type == "unemployed":
        return "unemployed"

    if schedule.type == "cycle":
        if (
            schedule.start_date is None
            or schedule.work_days is None
            or schedule.rest_days is None
        ):
            return "rest"
        delta = (d - schedule.start_date).days
        if delta < 0:
            return "rest"
        cycle = schedule.work_days + schedule.rest_days
        if cycle == 0:
            return "rest"
        return "work" if (delta % cycle) < schedule.work_days else "rest"

    if schedule.type == "weekly":
        if schedule.weekly_mask is None:
            return "rest"
        if schedule.respect_holidays and holiday_type == 3:
            return "work"
        bit = 1 << d.weekday()
        return "work" if schedule.weekly_mask & bit else "rest"

    # custom — driven entirely by overrides
    return "rest"


def weekly_mask_from_days(days: list[int]) -> int:
    """[0,1,2,3,4] (Mon–Fri) → bitmask."""
    m = 0
    for d in days:
        if 0 <= d <= 6:
            m |= 1 << d
    return m


def days_from_weekly_mask(mask: int) -> list[int]:
    return [d for d in range(7) if mask & (1 << d)]
