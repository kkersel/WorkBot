# WorkBot (шокобургер) — Telegram-бот + мини-апп

Трекаем график работы, отпуска и зал в компании друзей.
Бот живёт в группе, у каждого участника — свой график и своё приложение.

```
┌──────────────┐        ┌───────────────────┐
│  Telegram    │──────▶ │  bot  (aiogram 3) │──▶ Supabase
│   group      │        │   VPS + systemd   │    Postgres
└──────┬───────┘        └────────┬──────────┘
       │                         │ shared schema
       │  WebApp                 ▼
       ▼                ┌───────────────────┐
┌──────────────┐        │ webapp (Next.js)  │
│ mini-app UI  │◀──────▶│   Vercel          │
└──────────────┘        └───────────────────┘
```

## Структура репо

```
bot/          # Python-бот на aiogram 3
  src/
    main.py          # entrypoint: python -m bot.src.main
    config.py        # env-переменные
    db.py            # asyncpg pool
    bot.py           # Bot + Dispatcher
    texts.py         # русские тексты / рандомные вариации
    handlers/        # /start, /status, /set, /vacation, /gym, /invite, /sync
    keyboards/       # inline- и reply-клавиатуры
    services/        # schedule engine, queries, AI, scheduler, calendar
  requirements.txt

webapp/       # Telegram Mini-App на Next.js 16
  app/
    layout.tsx       # загружает TG WebApp SDK, применяет тему
    page.tsx         # главная — мой график + тайлы
    status/          # кто сегодня работает / отдыхает
    schedule/        # редактор графика (cycle / weekly / unemployed / custom)
    vacations/       # CRUD отпусков
    gym/             # настройки зала
    calendar/        # месячный календарь + оверрайды по дням
    api/             # route handlers (auth / me / status / calendar / ...)
  lib/
    db.ts            # postgres client
    tg.ts            # валидация initData
    session.ts       # cookie-сессия
    schedule.ts      # движок day_status (зеркалит Python)
    queries.ts       # server-side SQL

db/
  migrations/
    0001_initial.sql # users, schedules, vacations, gym_*, holidays, invites, ...
```

## Стек

- **Bot**: Python 3.11+, [aiogram 3.14](https://aiogram.dev), asyncpg, APScheduler, httpx
- **DB**: Supabase Postgres (asyncpg из бота, `postgres` npm-клиент из webapp)
- **Webapp**: Next.js 16 App Router, React 19, Tailwind v4, Zod, TypeScript strict
- **AI (для `/invite`)**: Gemini 2.5 Flash (основной) → fallback на Groq Llama 3.3
- **Производственный календарь РФ**: xmlcalendar.ru, раз в неделю + по `/sync`

## Команды бота

| Команда              | Что делает                                       |
| -------------------- | ------------------------------------------------ |
| `/start`             | Приветствие + кнопка «открыть приложение»        |
| `/help`              | Шпаргалка                                        |
| `/app`               | Открыть WebApp                                   |
| `/status`            | Кто сегодня где + общий выходной                 |
| `/me`                | Мой график                                       |
| `/set 3/2 [DD.MM]`   | Быстро задать цикл                               |
| `/unemployed`        | Статус безработного 😎                           |
| `/vacation 01.06-14.06` | Добавить отпуск                               |
| `/vacations`         | Список своих отпусков                            |
| `/gym`               | Переключить напоминания про зал                  |
| `/invite бар`        | Позвать всех куда-нибудь через AI                |
| `/sync`              | Обновить производственный календарь              |
| `/chatid`            | Показать ID текущего чата                        |

Всё тонкое (разметка календаря, темы тренировок, точное расписание
зала, кастомный график) — через **WebApp**.

## Локальный запуск

### 1. Секреты

```bash
cp .env.example .env
# заполни TELEGRAM_BOT_TOKEN, DATABASE_URL, WEBAPP_URL и остальное
```

См. `ACCESS.md` — где чей аккаунт и как в него попасть.

### 2. База

Выполни `db/migrations/0001_initial.sql` на пустой БД (Supabase SQL editor
или `psql $DATABASE_URL -f db/migrations/0001_initial.sql`).

### 3. Бот

```bash
cd bot
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ..
python -m bot.src.main
```

### 4. WebApp

```bash
cd webapp
npm install
npm run dev   # http://localhost:3000
```

Mini-app работает только внутри Telegram (нужны `initData` и HMAC-подпись).
В браузере напрямую — увидишь баннер «open this app from Telegram».

### 5. Прокинуть webapp в Telegram

1. В [@BotFather](https://t.me/BotFather) → `/mybots` → бот → **Bot Settings → Menu Button → Configure Menu Button**.
2. Укажи `WEBAPP_URL` — тот же, что в `.env` (публично доступный HTTPS).
3. Этот же URL бот подсовывает в inline- и reply-кнопках (см. `bot/src/keyboards/main_menu.py`).

## Деплой

См. `DEPLOY.md` (бот → VPS/systemd, webapp → Vercel/Supabase).

## Заметки

- Старый монолит `bot.py` + `data.json` оставлены до полной миграции данных — можно удалить после проверки.
- Исходная версия (JSON-файл, простой цикл) — в git-истории до рефакторинга.
