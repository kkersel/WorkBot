from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    WebAppInfo,
)

from .. import config


def webapp_inline(label: str = "🍔 открыть приложение") -> InlineKeyboardMarkup | None:
    if not config.WEBAPP_URL:
        return None
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=label, web_app=WebAppInfo(url=config.WEBAPP_URL)),
    ]])


def main_reply() -> ReplyKeyboardMarkup | ReplyKeyboardRemove:
    if not config.WEBAPP_URL:
        return ReplyKeyboardRemove()
    return ReplyKeyboardMarkup(
        keyboard=[[
            KeyboardButton(text="🍔 моё приложение", web_app=WebAppInfo(url=config.WEBAPP_URL)),
        ]],
        resize_keyboard=True,
        is_persistent=True,
    )


def invite_responses(invite_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ иду", callback_data=f"inv:yes:{invite_id}"),
        InlineKeyboardButton(text="🤔 мб",  callback_data=f"inv:maybe:{invite_id}"),
        InlineKeyboardButton(text="❌ нет", callback_data=f"inv:no:{invite_id}"),
    ]])
