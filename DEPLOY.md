# Деплой

Два компонента деплоятся независимо:

1. **Bot** (Python) → VPS, под systemd
2. **Webapp** (Next.js) → Vercel (или любой Node-хост)
3. **DB** → Supabase Postgres

Список аккаунтов/доступов — в [`ACCESS.md`](./ACCESS.md).

---

## 1. База (Supabase)

1. Войди в Supabase под `pestr@way.edu.rs`, создай (или открой) проект.
2. Database → Settings → Connection string → скопируй URI для `DATABASE_URL`
   (prefer **Transaction pooler, port 6543** — тогда в приложении ставим
   `statement_cache_size=0` / `prepare: false`, что уже сделано).
3. Открой **SQL Editor**, прогони `db/migrations/0001_initial.sql`.
4. Скопируй `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   из Settings → API — они нужны в `.env` (webapp пока использует только
   `DATABASE_URL` напрямую, но пусть будут).

---

## 2. Bot на VPS

### 2.1 Предпосылки

```bash
ssh <user>@<vps-ip>
sudo apt update && sudo apt install -y python3.11 python3.11-venv git
```

### 2.2 Код

```bash
sudo mkdir -p /opt/workbot && sudo chown $USER /opt/workbot
cd /opt/workbot
git clone <repo-url> .
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r bot/requirements.txt
```

### 2.3 `.env`

```bash
nano /opt/workbot/.env
```

Минимум для бота:

```
TELEGRAM_BOT_TOKEN=...
DATABASE_URL=postgres://...supabase...
WEBAPP_URL=https://workbot.vercel.app
PRIMARY_CHAT_ID=-100...          # ID вашей группы (узнать: /chatid)
GEMINI_API_KEY=...               # аккаунт: x.innv1
GROQ_API_KEY=...                 # опционально
```

### 2.4 systemd

`/etc/systemd/system/workbot.service`:

```ini
[Unit]
Description=WorkBot Telegram Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/workbot
EnvironmentFile=/opt/workbot/.env
ExecStart=/opt/workbot/.venv/bin/python -m bot.src.main
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now workbot
sudo systemctl status workbot
journalctl -u workbot -f
```

### 2.5 Обновление

```bash
cd /opt/workbot
git pull
source .venv/bin/activate
pip install -r bot/requirements.txt
sudo systemctl restart workbot
```

---

## 3. Webapp на Vercel

### 3.1 Создать проект

1. Залей репо на GitHub.
2. На Vercel — Add New → Project → импорти репо.
3. **Root Directory: `webapp`**.
4. Framework: Next.js (определится автоматически).

### 3.2 Environment Variables

В Settings → Environment Variables:

| Name                     | Value                        | Env         |
| ------------------------ | ---------------------------- | ----------- |
| `TELEGRAM_BOT_TOKEN`     | тот же, что у бота           | Production  |
| `DATABASE_URL`           | Supabase URI (pooler 6543)   | Production  |
| `NEXT_PUBLIC_APP_URL`    | `https://workbot.vercel.app` | Production  |

Бот использует `TELEGRAM_BOT_TOKEN` для валидации `initData` **и** как
секрет для подписи cookie-сессии — токен обязан совпадать у бота и webapp.

### 3.3 Деплой

Vercel деплоится сам на каждый push в main. После первого деплоя:

1. Скопируй итоговый URL (например `https://workbot-xyz.vercel.app`).
2. Запиши его в `.env` бота как `WEBAPP_URL`, перезапусти бота.
3. В [@BotFather](https://t.me/BotFather) → `/mybots` → бот →
   **Bot Settings → Menu Button → Configure menu button** → укажи этот URL.

---

## 4. Смена токенов / ротация

- **Bot token**: `/revoke` в BotFather → новый токен → обновить в `.env`
  бота **и** в Vercel env vars **и** перезапустить оба.
- **Gemini**: https://aistudio.google.com (аккаунт `x.innv1`) → создать
  новый ключ → обновить `GEMINI_API_KEY` у бота.
- **Supabase**: Settings → Database → Reset password → новый `DATABASE_URL`
  в обоих окружениях.

---

## 5. Траблшутинг

**Бот стоит, но не отвечает** — `journalctl -u workbot -n 100`.

**`Conflict: terminated by other getUpdates request`** — запущен второй
инстанс (локально + VPS). Выключи один.

**Mini-app «open this app from Telegram»** — открываешь напрямую в
браузере. Это ожидаемо: нет `initData`. Открой через Menu Button бота.

**Mini-app «invalid initData»** — `TELEGRAM_BOT_TOKEN` в Vercel не
совпадает с токеном бота.

**Webapp 401 на API** — cookie-сессия не дошла. Проверь, что
`NEXT_PUBLIC_APP_URL` отдаёт HTTPS (Telegram mini-apps работают только
поверх TLS, и cookie стоит `sameSite: none; secure`).
