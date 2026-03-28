# WorkBot — Деплой на VPS

## Быстрый деплой с нуля

### 1. Подключись к серверу

```bash
ssh root@твой-server-ip
```

### 2. Установи Python

```bash
apt update && apt install -y python3 python3-pip python3-venv
```

### 3. Создай папку и загрузи файлы

```bash
mkdir -p /opt/workbot
```

С Mac:
```bash
scp -r /Users/alex/Documents/Github/WorkBot/* root@твой-server-ip:/opt/workbot/
```

### 4. Настрой окружение

```bash
cd /opt/workbot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 5. Создай `.env`

```bash
nano /opt/workbot/.env
```

```
TELEGRAM_BOT_TOKEN=твой_токен_сюда
```

### 6. Создай systemd сервис

```bash
nano /etc/systemd/system/workbot.service
```

```ini
[Unit]
Description=WorkBot Telegram Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/workbot
ExecStart=/opt/workbot/venv/bin/python3 /opt/workbot/bot.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 7. Запусти

```bash
systemctl daemon-reload
systemctl enable workbot
systemctl start workbot
```

---

## Управление ботом

```bash
# Перезапустить
sudo systemctl restart workbot.service

# Остановить
sudo systemctl stop workbot.service

# Статус
sudo systemctl status workbot.service

# Логи (в реальном времени)
journalctl -u workbot -f

# Последние 50 строк логов
journalctl -u workbot -n 50
```

---

## Обновление кода

С Mac:
```bash
scp /Users/alex/Documents/Github/WorkBot/bot.py root@твой-server-ip:/opt/workbot/bot.py
```

На сервере:
```bash
sudo systemctl restart workbot.service
```

---

## Решение проблем

**Бот не запускается** — смотри логи: `journalctl -u workbot -n 50`

**Conflict: terminated by other getUpdates request** — бот запущен дважды:
```bash
pkill -9 -f bot.py
systemctl start workbot
```

**Бот не находит пользователя** — бот должен быть админом чата
