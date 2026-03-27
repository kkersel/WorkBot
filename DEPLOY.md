# WorkBot — Полный гайд по запуску

Telegram-бот для отслеживания графика работы в чате.

---

## 📋 Функционал

- **График работы** — настройка цикла (3/2, 4/2, 7/0 и т.д.)
- **Статус сегодня** — кто работает, кто отдыхает
- **Общий выходной** — когда у всех выходной в один день
- **Безработные** — статус 😎
- **Кастомные эмодзи** — анимированные иконки
- **Назначение графика** — себе или другому участнику

---

## 🎯 Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Приветствие и справка |
| `/set 3/2 01.03` | Установить график (3 рабочих/2 выходных, старт 1 марта) |
| `/set @username 3/2 01.03` | Установить график другому (через @username) |
| `/set 3/2` (ответ на сообщение) | Установить график тому, на чьё сообщение ответил |
| `/status` | Кто сегодня работает/отдыхает + общий выходной |
| `/dayoff` | Ближайший общий выходной |
| `/unemployed` | Статус безработного 😎 |
| `/work` | Вернуться к графику |
| `/sync` | Синхронизировать участников чата |
| **Любое сообщение с эмодзи** | Бот ответит ID кастомного эмодзи |

---

## 📁 Структура проекта

```
WorkBot/
├── bot.py              # Основной код бота
├── requirements.txt    # Зависимости Python
├── .env                # Токен бота (не коммитить!)
├── .env.example        # Пример .env
├── data.json           # База данных пользователей
├── README.md           # Краткая инструкция
└── DEPLOY.md           # Этот файл
```

---

## 🚀 Локальный запуск (для теста)

### 1. Установи зависимости

```bash
pip install -r requirements.txt
```

### 2. Создай файл `.env`

```bash
TELEGRAM_BOT_TOKEN=8703393181:AAHzd0Xt1vMCC209SiefcKSe2U6b2V8h-yo
```

### 3. Запусти бота

```bash
python3 bot.py
```

---

## 🖥️ Размещение на VPS (для работы 24/7)

### Шаг 1: Подключись к VPS

```bash
ssh root@твой-server-ip
```

### Шаг 2: Создай папку для бота

```bash
mkdir -p /opt/workbot
cd /opt/workbot
```

### Шаг 3: Загрузи файлы

**Через scp (на своём Mac):**
```bash
scp -r /Users/alex/Documents/Github/WorkBot/* root@твой-server-ip:/opt/workbot/
```

**Или через Git:**
```bash
git clone https://github.com/твой-username/WorkBot.git .
```

### Шаг 4: Установи Python

```bash
apt update
apt install -y python3 python3-pip python3-venv
```

### Шаг 5: Настрой окружение

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Шаг 6: Создай файл с токеном

```bash
nano .env
```

Вставь токен:
```
TELEGRAM_BOT_TOKEN=8703393181:AAHzd0Xt1vMCC209SiefcKSe2U6b2V8h-yo
```

Нажми `Ctrl+O` → `Enter` → `Ctrl+X`.

### Шаг 7: Проверь что бот работает

```bash
python3 bot.py
```

Должно появиться: `Бот запущен...`

Нажми `Ctrl+C` чтобы остановить.

### Шаг 8: Создай systemd сервис

```bash
nano /etc/systemd/system/workbot.service
```

Вставь:

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

**Важно:** Без пробелов в начале строк!

Нажми `Ctrl+O` → `Enter` → `Ctrl+X`.

### Шаг 9: Запусти сервис

```bash
systemctl daemon-reload
systemctl enable workbot
systemctl start workbot
```

### Шаг 10: Проверь статус

```bash
systemctl status workbot
```

Должно быть: `active (running)`.

Нажми `q` чтобы выйти.

---

## 📊 Управление ботом на VPS

```bash
# Посмотреть логи
journalctl -u workbot -f

# Перезапустить
systemctl restart workbot

# Остановить
systemctl stop workbot

# Статус
systemctl status workbot

# Включить автозапуск
systemctl enable workbot
```

---

## 🔧 Примеры использования

### Настроить себе график

```
/set 3/2 01.03
```

### Настроить другому (через @)

```
/set @needwi 7/0 31.03
```

### Настроить другому (через reply)

1. Ответь на сообщение пользователя
2. Отправь: `/set 7/0 31.03`

### Проверить статус

```
/status
```

**Пример вывода:**
```
Сегодня – Пятница 27 марта

🚬 Общий выходной – Понедельник 30 марта

👀 Выходной:
— Дима • 1 дн.

🏃‍♂️ Работают:
— Саша • 2 дн.

😎 БЫТЬ БОГАТЫМ АХУЕННАААА:
— Макс
```

---

## 🎨 Кастомные эмодзи

Бот использует анимированные эмодзи Telegram:

| Эмодзи | Назначение | ID |
|--------|------------|-----|
| 🏃‍♂️ | Работают | `5317051379372532889` |
| 👀 | Выходной | `5210956306952758910` |
| 🚬 | Общий выходной | `5319087606187695888` |
| 😎 | Безработные | `5357271420227297695` |

**Как узнать ID любого эмодзи:**
1. Отправь боту сообщение с эмодзи
2. Бот ответит его ID

---

## 🔐 Безопасность

- **Файл `.env`** не коммить в Git (добавлен в `.gitignore`)
- **Токен бота** хранить в секрете
- На VPS бот работает от `root` — можно создать отдельного пользователя для безопасности

---

## 🐛 Решение проблем

### Бот не запускается

```bash
# Проверь логи
journalctl -u workbot -n 50

# Проверь что файлы на месте
ls -la /opt/workbot/

# Проверь .env
cat /opt/workbot/.env
```

### Ошибка systemd

```bash
# Проверь статус
systemctl status workbot.service

# Перезагрузи systemd
systemctl daemon-reload
```

### Бот не находит пользователя

- Бот должен быть **админом чата**
- Для `/set @username` — пользователь должен быть в чате
- Альтернатива: используй **reply** на сообщение

### Conflict: terminated by other getUpdates request

Значит бот запущен в нескольких местах. Убей старые процессы:

```bash
pkill -9 -f bot.py
```

---

## 📝 Зависимости

**requirements.txt:**
```
python-telegram-bot==21.0
python-dotenv==1.0.0
```

---

## 📞 Поддержка

Если что-то сломалось:

1. Проверь логи: `journalctl -u workbot -f`
2. Проверь статус: `systemctl status workbot`
3. Убедись что токен правильный в `.env`
4. Проверь что бот добавлен в чат

---

## 🎯 Быстрый старт (шпаргалка)

```bash
# На VPS
cd /opt/workbot
source venv/bin/activate
python3 bot.py &

# Или через systemd
systemctl start workbot
systemctl status workbot
```

---

**Готово!** Бот работает 24/7 🚀
