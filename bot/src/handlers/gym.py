from datetime import date as date_cls

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from .. import texts
from ..services import queries

router = Router(name="gym")


@router.message(Command("gym"))
async def cmd_gym(m: Message) -> None:
    await queries.upsert_user(m.from_user)
    enabled = await queries.toggle_gym(m.from_user.id)
    if enabled:
        await m.answer(
            "ок, записал в зальные. по умолчанию <b>вт / чт (ноги) / сб / вс</b>.\n"
            "вечером буду спрашивать — идёшь или сливаешь.\n"
            "дни и время можно менять в приложении."
        )
    else:
        await m.answer("всё, без зала так без зала.")


@router.callback_query(F.data.startswith("gym:"))
async def on_gym_reply(cb: CallbackQuery) -> None:
    try:
        _, answer, d_iso = cb.data.split(":", 2)
        d = date_cls.fromisoformat(d_iso)
    except (ValueError, AttributeError):
        await cb.answer("старая кнопка")
        return

    going = answer == "yes"
    await queries.upsert_user(cb.from_user)
    await queries.record_gym_attendance(cb.from_user.id, d, going)

    reply = texts.pick(texts.GYM_YES if going else texts.GYM_NO)
    if cb.message is not None:
        try:
            await cb.message.edit_reply_markup(reply_markup=None)
        except Exception:
            pass
    await cb.answer(reply, show_alert=False)
