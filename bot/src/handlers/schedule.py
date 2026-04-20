from datetime import datetime
from zoneinfo import ZoneInfo

from aiogram import Router
from aiogram.filters import Command, CommandObject
from aiogram.types import Message

from .. import config
from ..services import queries
from ..services.schedule_engine import days_from_weekly_mask

router = Router(name="schedule")
MSK = ZoneInfo(config.TZ)

RU_DAYS_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]


def _parse_cycle(s: str) -> tuple[int, int] | None:
    if "/" not in s:
        return None
    a, b = s.split("/", 1)
    try:
        return int(a), int(b)
    except ValueError:
        return None


def _parse_date(s: str, default_year: int) -> object | None:
    for fmt in ("%d.%m.%Y", "%d.%m", "%Y-%m-%d"):
        try:
            d = datetime.strptime(s, fmt)
            if fmt == "%d.%m":
                d = d.replace(year=default_year)
            return d.date()
        except ValueError:
            continue
    return None


@router.message(Command("set"))
async def cmd_set(m: Message, command: CommandObject) -> None:
    if not command.args:
        await m.answer(
            "дай график: <code>/set 3/2</code>\n"
            "можно с датой старта: <code>/set 3/2 01.05</code>"
        )
        return
    parts = command.args.split()
    cycle = _parse_cycle(parts[0])
    if not cycle:
        await m.answer("формат: <code>/set 3/2</code>")
        return
    work, rest = cycle
    if work <= 0 or rest < 0 or work + rest == 0:
        await m.answer("странные числа. пример: <code>/set 3/2</code>")
        return

    today = datetime.now(MSK).date()
    start = today
    if len(parts) > 1:
        parsed = _parse_date(parts[1], today.year)
        if parsed is None:
            await m.answer("не понял дату. форматы: <code>DD.MM</code>, <code>DD.MM.YYYY</code>")
            return
        start = parsed  # type: ignore[assignment]

    chat_id = m.chat.id if m.chat.type != "private" else None
    await queries.upsert_user(m.from_user, chat_id=chat_id)
    await queries.set_schedule_cycle(m.from_user.id, work, rest, start)
    await m.answer(
        f"ок, <b>{m.from_user.first_name}</b>: график <b>{work}/{rest}</b> "
        f"с {start.strftime('%d.%m.%Y')}"
    )


@router.message(Command("me"))
async def cmd_me(m: Message) -> None:
    sched = await queries.fetch_schedule(m.from_user.id)
    if not sched:
        await m.answer(
            "у тебя ещё нет графика.\n"
            "поставь быстро: <code>/set 3/2</code> — или открой приложение."
        )
        return

    if sched.type == "cycle" and sched.start_date:
        desc = f"<b>{sched.work_days}/{sched.rest_days}</b>, с {sched.start_date.strftime('%d.%m.%Y')}"
    elif sched.type == "weekly" and sched.weekly_mask is not None:
        days = days_from_weekly_mask(sched.weekly_mask)
        names = ", ".join(RU_DAYS_SHORT[d] for d in days) or "—"
        desc = f"<b>недельный:</b> {names}"
    elif sched.type == "unemployed":
        desc = "<b>безработный</b> 😎"
    else:
        desc = "<b>кастомный график</b>"

    holidays_note = "учитываются" if sched.respect_holidays else "игнорируются"
    await m.answer(f"{desc}\n<i>праздники {holidays_note}</i>")


@router.message(Command("unemployed"))
async def cmd_unemployed(m: Message) -> None:
    await queries.upsert_user(m.from_user)
    await queries.set_schedule_unemployed(m.from_user.id)
    await m.answer("теперь ты безработный 😎 заслужил.")
