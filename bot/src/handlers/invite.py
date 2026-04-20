import json
import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import CallbackQuery, Message

from .. import db, texts
from ..keyboards.main_menu import invite_responses
from ..services import invites, queries

router = Router(name="invite")
log = logging.getLogger(__name__)


@router.message(Command("invite"))
async def cmd_invite(m: Message, command: CommandObject) -> None:
    if not command.args:
        variants = ", ".join(texts.INVITE_KINDS.keys())
        await m.answer(
            f"<b>кого куда зовём?</b>\n"
            f"пример: <code>/invite пул</code>\n"
            f"варианты: {variants}\n"
            f"можно с уточнением: <code>/invite бар с террасой в центре</code>"
        )
        return

    tokens = command.args.split(maxsplit=1)
    kind_short = tokens[0].lower().strip()
    user_hint = tokens[1] if len(tokens) > 1 else None
    kind_label = texts.INVITE_KINDS.get(kind_short, kind_short)

    thinking = await m.answer("секунду, думаю куда бы нас всех... 🤔")
    try:
        data = await invites.suggest_place(kind_label, user_hint)
    except Exception as e:
        log.exception("invite generation failed")
        await thinking.edit_text(f"ai сегодня не в настроении: <code>{e}</code>")
        return

    inviter = m.from_user.first_name
    card = invites.format_invite_card(data, inviter, kind_label)

    async with db.conn() as c:
        invite_id = await c.fetchval(
            """
            INSERT INTO invites (chat_id, created_by, kind, prompt,
                                 place_name, place_address, place_url, place_phone,
                                 price_range, ai_raw)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
            RETURNING id
            """,
            m.chat.id, m.from_user.id, kind_short, user_hint,
            data.get("place_name"), data.get("address"),
            data.get("url"), data.get("phone"),
            data.get("price_range"), json.dumps(data),
        )

    await thinking.delete()
    sent = await m.answer(card, reply_markup=invite_responses(invite_id))

    async with db.conn() as c:
        await c.execute(
            "UPDATE invites SET message_id = $1 WHERE id = $2",
            sent.message_id, invite_id,
        )


@router.callback_query(F.data.startswith("inv:"))
async def on_invite_response(cb: CallbackQuery) -> None:
    try:
        _, answer, id_s = cb.data.split(":", 2)
        invite_id = int(id_s)
    except (ValueError, AttributeError):
        await cb.answer("хз что это")
        return

    if answer not in ("yes", "no", "maybe"):
        await cb.answer("некорректный ответ")
        return

    await queries.upsert_user(cb.from_user)
    async with db.conn() as c:
        await c.execute(
            """
            INSERT INTO invite_responses (invite_id, user_id, response)
            VALUES ($1, $2, $3)
            ON CONFLICT (invite_id, user_id) DO UPDATE SET
              response = EXCLUDED.response, responded_at = now()
            """,
            invite_id, cb.from_user.id, answer,
        )
        rows = await c.fetch(
            """
            SELECT r.response, u.first_name
            FROM invite_responses r
            JOIN users u ON u.id = r.user_id
            WHERE r.invite_id = $1
            """,
            invite_id,
        )

    yes   = [r["first_name"] for r in rows if r["response"] == "yes"]
    maybe = [r["first_name"] for r in rows if r["response"] == "maybe"]
    no    = [r["first_name"] for r in rows if r["response"] == "no"]

    if cb.message and cb.message.html_text:
        base = cb.message.html_text
        cut = base.find("кто идёт?")
        if cut >= 0:
            base = base[:cut].rstrip()
        # Strip any prior vote block
        marker = base.rfind("\n\n")
        if "✅" in base or "❌" in base or "🤔" in base:
            # likely a vote block exists — strip everything after last \n\n separator
            base = base[:marker].rstrip() if marker > 0 else base
        tail = []
        if yes:
            tail.append(f"✅ <b>{len(yes)}</b>: {', '.join(yes)}")
        if maybe:
            tail.append(f"🤔 <b>{len(maybe)}</b>: {', '.join(maybe)}")
        if no:
            tail.append(f"❌ <b>{len(no)}</b>: {', '.join(no)}")
        new_text = base + ("\n\n" + "\n".join(tail) if tail else "")
        try:
            await cb.message.edit_text(new_text, reply_markup=invite_responses(invite_id))
        except Exception as e:
            log.debug("edit failed: %s", e)

    replies = {
        "yes":   "красава, записал",
        "maybe": "ну думай-думай",
        "no":    "как хочешь",
    }
    await cb.answer(replies[answer])
