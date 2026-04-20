from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.filters.chat_member_updated import JOIN_TRANSITION, ChatMemberUpdatedFilter
from aiogram.types import ChatMemberUpdated, Message

from .. import texts
from ..keyboards.main_menu import main_reply, webapp_inline
from ..services import queries

router = Router(name="start")


@router.message(CommandStart())
async def cmd_start(m: Message) -> None:
    chat_id = m.chat.id if m.chat.type != "private" else None
    await queries.upsert_user(m.from_user, chat_id=chat_id)
    if chat_id is not None:
        await queries.ensure_chat(m.chat.id, m.chat.title)

    greeting = texts.pick(texts.GREETINGS, name=m.from_user.first_name)
    if m.chat.type == "private":
        await m.answer(f"{greeting}\n\n{texts.START_INFO}", reply_markup=main_reply())
    else:
        await m.answer(f"{greeting}\n\n{texts.START_INFO}", reply_markup=webapp_inline())


@router.message(Command("help"))
async def cmd_help(m: Message) -> None:
    await m.answer(texts.HELP, reply_markup=webapp_inline())


@router.message(Command("app"))
async def cmd_app(m: Message) -> None:
    await m.answer("открыть приложение:", reply_markup=webapp_inline())


@router.my_chat_member(ChatMemberUpdatedFilter(member_status_changed=JOIN_TRANSITION))
async def on_bot_added(event: ChatMemberUpdated) -> None:
    chat = event.chat
    if chat.type in ("group", "supergroup"):
        await queries.ensure_chat(chat.id, chat.title)


@router.message(Command("chatid"))
async def cmd_chatid(m: Message) -> None:
    await m.answer(f"chat_id: <code>{m.chat.id}</code>")
