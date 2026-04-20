from datetime import datetime
from zoneinfo import ZoneInfo

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from .. import config, texts
from ..services import status_view

router = Router(name="status")
MSK = ZoneInfo(config.TZ)

WEEKDAYS_FULL = [
    "понедельник", "вторник", "среда", "четверг",
    "пятница", "суббота", "воскресенье",
]
MONTHS_GEN = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]

STATUS_EMOJI = {
    "work":       "🏃",
    "rest":       "👀",
    "vacation":   "🏖",
    "holiday":    "🎉",
    "unemployed": "😎",
}
STATUS_TITLE = {
    "work":       "работают",
    "rest":       "отдыхают",
    "vacation":   "в отпуске",
    "holiday":    "праздник",
    "unemployed": "безработные",
}
ORDER = ("work", "rest", "vacation", "holiday", "unemployed")


@router.message(Command("status"))
async def cmd_status(m: Message) -> None:
    today = datetime.now(MSK).date()
    views = await status_view.compute_day(today)

    if not views:
        await m.answer(texts.NO_USERS)
        return

    weekday = WEEKDAYS_FULL[today.weekday()]
    date_str = f"{today.day} {MONTHS_GEN[today.month - 1]}"
    lines = [f"📅 <b>{weekday}, {date_str}</b>", "━━━━━━━━━━━━━━━━━━"]

    workers = [v for v in views if v.status == "work"]
    if views and not workers:
        lines.append("")
        lines.append(texts.ALL_OFF)

    for status_key in ORDER:
        bucket = [v for v in views if v.status == status_key]
        if not bucket:
            continue
        lines.append(f"\n{STATUS_EMOJI[status_key]} <b>{STATUS_TITLE[status_key]}:</b>")
        for v in bucket:
            label = f" <i>({v.label})</i>" if v.label else ""
            lines.append(f"  • {v.name}{label}")

    common_off = await status_view.find_next_common_off(today)
    if common_off == today:
        lines.append("\n🚬 сегодня у всех выходной 🔥")
    elif common_off:
        days_until = (common_off - today).days
        cw = WEEKDAYS_FULL[common_off.weekday()]
        cds = f"{common_off.day} {MONTHS_GEN[common_off.month - 1]}"
        lines.append(f"\n🚬 общий выходной: <b>{cw}, {cds}</b> (через {days_until} дн.)")

    await m.answer("\n".join(lines))
