import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

BOT_TOKEN       = os.environ.get("TELEGRAM_BOT_TOKEN", "")
DATABASE_URL    = os.environ.get("DATABASE_URL", "")
WEBAPP_URL      = os.environ.get("WEBAPP_URL", "")
PRIMARY_CHAT_ID = int(os.environ.get("PRIMARY_CHAT_ID") or 0)
GROQ_API_KEY    = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL      = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
GEMINI_API_KEY  = os.environ.get("GEMINI_API_KEY", "")
TZ              = "Europe/Moscow"

_REQUIRED = {
    "TELEGRAM_BOT_TOKEN": BOT_TOKEN,
    "DATABASE_URL": DATABASE_URL,
    "WEBAPP_URL": WEBAPP_URL,
}


def validate() -> None:
    missing = [k for k, v in _REQUIRED.items() if not v]
    if missing:
        raise RuntimeError(f"missing env vars: {', '.join(missing)}")
