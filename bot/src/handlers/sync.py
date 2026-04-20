"""
/sync — admin command: force-refresh Russian production calendar.
Useful right after deploy or when xmlcalendar pushes updates.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from .. import config
from ..services import calendar as calendar_svc

router = Router(name="sync")
MSK = ZoneInfo(config.TZ)


@router.message(Command("sync"))
async def cmd_sync(m: Message) -> None:
    await m.answer("синкаю производственный календарь…")
    now = datetime.now(MSK)
    total = 0
    errs: list[str] = []
    for y in (now.year, now.year + 1):
        try:
            total += await calendar_svc.sync_year(y)
        except Exception as e:  # noqa: BLE001
            errs.append(f"{y}: {e}")

    msg = f"готово, {total} записей."
    if errs:
        msg += "\n\nошибки:\n" + "\n".join(errs)
    await m.answer(msg)
