# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WorkBot — Telegram bot for tracking work/rest schedules (Russian language). Users set shift patterns (e.g., 3 days on / 2 days off), and the bot shows who's working today, who's resting, and when the next common day off is.

## Running

```bash
pip install -r requirements.txt
python bot.py
```

Requires `.env` file with `TELEGRAM_BOT_TOKEN`.

## Architecture

Single-file app (`bot.py`) using `python-telegram-bot==21.0` (async). All user data is stored in `data.json` as a flat dict keyed by Telegram user ID. No database, no tests, no CI/CD.

Bot commands: `/start`, `/set`, `/status`, `/dayoff`, `/unemployed`, `/work`, `/sync`.

Status output uses Telegram custom emoji IDs (HTML `<tg-emoji>` tags) defined as constants at the top of `bot.py`.
