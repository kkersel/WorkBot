# Доступы и аккаунты

Где что хостится и под каким аккаунтом — чтобы не искать.

| Сервис         | Аккаунт / владелец         | Где найти / как войти                    |
| -------------- | -------------------------- | ---------------------------------------- |
| Gemini API     | **x.innv1**                | https://aistudio.google.com → API keys   |
| Supabase       | **pestr@way.edu.rs**       | https://supabase.com/dashboard           |
| VPS            | **45.81.35.72**            | `ssh root@45.81.35.72`                   |
| Telegram Bot   | @BotFather                 | ключ в `.env` (`TELEGRAM_BOT_TOKEN`)     |
| Groq (резерв)  | не выдан                   | https://console.groq.com                 |

## Что куда деплоится

- **Bot** — на VPS, `python -m bot.src.main` под systemd / pm2.
- **Webapp** — Vercel (или любой хостинг Next.js), из `webapp/`.
- **База** — Supabase Postgres, миграции в `db/migrations/`.

## Как прокинуть доступы в окружение

`.env` в корне — для бота и локальной разработки webapp. На Vercel
те же переменные вбиваются в Project Settings → Environment Variables.

Список переменных — в `.env.example`.
