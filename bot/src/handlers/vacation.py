from datetime import date, datetime
from zoneinfo import ZoneInfo

from aiogram import Router
from aiogram.filters import Command, CommandObject
from aiogram.types import Message

from .. import config
from ..services import queries

router = Router(name="vacation")
MSK = ZoneInfo(config.TZ)


def _parse(s: str, default_year: int) -> date | None:
    for fmt in ("%d.%m.%Y", "%d.%m", "%Y-%m-%d"):
        try:
            d = datetime.strptime(s, fmt)
            if fmt == "%d.%m":
                d = d.replace(year=default_year)
            return d.date()
        except ValueError:
            continue
    return None


@router.message(Command("vacation"))
async def cmd_vacation(m: Message, command: CommandObject) -> None:
    if not command.args:
        await m.answer(
            "формат: <code>/vacation 01.06-14.06</code>\n"
            "или список своих отпусков и удаление — в приложении."
        )
        return

    rng = command.args.replace("—", "-").replace("–", "-")
    if "-" not in rng:
        await m.answer("нужен диапазон через тире: <code>/vacation 01.06-14.06</code>")
        return

    a, b = (s.strip() for s in rng.split("-", 1))
    today = datetime.now(MSK).date()
    start = _parse(a, today.year)
    end = _parse(b, today.year)
    if not start or not end:
        await m.answer("не смог разобрать даты. формат <code>DD.MM</code> или <code>DD.MM.YYYY</code>")
        return
    if end < start:
        await m.answer("конец раньше начала, проверь")
        return

    await queries.upsert_user(m.from_user)
    await queries.add_vacation(m.from_user.id, start, end, label="отпуск")
    await m.answer(
        f"записал: отпуск <b>{start.strftime('%d.%m')} — {end.strftime('%d.%m.%Y')}</b>.\n"
        "в эти дни считаю тебя выпавшим из графика 🏖"
    )


@router.message(Command("vacations"))
async def cmd_vacations_list(m: Message) -> None:
    rows = await queries.fetch_vacations_full(m.from_user.id)
    if not rows:
        await m.answer("отпусков нет. жаль.")
        return
    lines = ["<b>твои отпуска:</b>"]
    for r in rows:
        lines.append(
            f"  • #{r['id']}: {r['start_date'].strftime('%d.%m')} — "
            f"{r['end_date'].strftime('%d.%m.%Y')}"
        )
    lines.append("\nудалить: открой приложение")
    await m.answer("\n".join(lines))
