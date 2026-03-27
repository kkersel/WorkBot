import os
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

# Загрузка токена из .env
load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

DATA_FILE = "data.json"
CHAT_ID = None

# Custom emoji IDs
EMOJI_WORK = "5317051379372532889"      # 🏃‍♂️ работают
EMOJI_COMMON_OFF = "5319087606187695888"  # 🚬 общий выходной
EMOJI_UNEMPLOYED = "5357271420227297695"  # 😎 безработные
EMOJI_REST = "5210956306952758910"    # 👀 выходной

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_day_status(work_days, rest_days, start_date, check_date):
    """Определяет, работает ли человек в check_date"""
    delta = (check_date - start_date).days
    cycle = work_days + rest_days
    day_in_cycle = delta % cycle
    return "work" if day_in_cycle < work_days else "rest"

def parse_schedule(schedule_str):
    """Парсит график типа '3/2', '4/2' и т.д."""
    parts = schedule_str.split("/")
    if len(parts) != 2:
        return None, None
    try:
        work_days = int(parts[0])
        rest_days = int(parts[1])
        return work_days, rest_days
    except ValueError:
        return None, None

def find_common_day_off(data, today):
    """Ищет ближайший день, когда у всех выходной"""
    # Получаем всех пользователей с графиками (не безработных)
    workers = {uid: info for uid, info in data.items() if "schedule" in info and not info.get("unemployed", False)}

    if not workers:
        return None

    # Проверяем следующие 365 дней
    for i in range(365):
        check_date = today + timedelta(days=i)
        all_off = True

        for uid, info in workers.items():
            work_days, rest_days = info["schedule"]
            start_date = datetime.strptime(info["start_date"], "%Y-%m-%d").date()
            status = get_day_status(work_days, rest_days, start_date, check_date)
            if status == "work":
                all_off = False
                break

        if all_off:
            return check_date

    return None

async def sync_chat_members(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Синхронизирует участников чата"""
    global CHAT_ID
    
    # Определяем chat_id
    if update.message.chat.type in ['group', 'supergroup']:
        CHAT_ID = update.message.chat.id
    elif context.bot_data.get('chat_id'):
        CHAT_ID = context.bot_data['chat_id']
    else:
        await update.message.reply_text("❌ Эта команда работает только в чате")
        return
    
    context.bot_data['chat_id'] = CHAT_ID
    
    try:
        members = await context.bot.get_chat_members(CHAT_ID)
        data = load_data()
        added_count = 0
        
        for member in members:
            if member.user.is_bot:
                continue
            
            uid = str(member.user.id)
            name = member.user.first_name
            
            if uid not in data:
                data[uid] = {
                    "name": name,
                    "unemployed": True  # По умолчанию безработный
                }
                added_count += 1
            else:
                # Обновляем имя если изменилось
                data[uid]["name"] = name
        
        save_data(data)
        await update.message.reply_text(f"✅ Синхронизировано {added_count} участников")
    except Exception as e:
        await update.message.reply_text(f"❌ Ошибка: {e}\n\nУбедитесь, что бот — админ чата")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "👋 Привет! Я бот для отслеживания графика работы.\n\n"
        "Команды:\n"
        "/set 3/2 — установить график (3 рабочих/2 выходных)\n"
        "/status — кто сегодня работает/отдыхает\n"
        "/dayoff — ближайший общий выходной\n"
        "/unemployed — стать безработным 😎\n"
        "/work — вернуться к графику\n"
        "/sync — синхронизировать участников чата"
    )

async def set_schedule(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("❌ Укажи график: /set 3/2")
        return

    # Определяем формат команды
    # /set 3/2 01.03 - себе
    # Ответ на сообщение + /set 3/2 01.03 - тому, на кого ответили
    # /set @username 3/2 01.03 - по username
    target_user_id = str(update.effective_user.id)
    target_name = update.effective_user.first_name
    
    args = context.args
    start_idx = 0
    
    # Если есть reply на сообщение
    if update.message.reply_to_message:
        target_user_id = str(update.message.reply_to_message.from_user.id)
        target_name = update.message.reply_to_message.from_user.first_name
    
    # Если первый аргумент - упоминание пользователя (@username)
    elif args[0].startswith('@'):
        username = args[0][1:]  # убираем @
        found = False
        
        # Ищем среди администраторов чата
        try:
            members = await context.bot.get_chat_administrators(update.message.chat.id)
            for member in members:
                user_username = member.user.username or ""
                if user_username.lower() == username.lower():
                    target_user_id = str(member.user.id)
                    target_name = member.user.first_name
                    found = True
                    start_idx = 1
                    break
            
            if not found:
                await update.message.reply_text(
                    f"❌ Не нашёл @{username}\n\n"
                    f"Убедитесь, что пользователь есть в чате"
                )
                return
        except Exception as e:
            await update.message.reply_text(f"❌ Ошибка поиска: {e}")
            return
    
    if len(args) <= start_idx:
        await update.message.reply_text("❌ Укажи график: /set 3/2")
        return
    
    schedule_str = args[start_idx]
    work_days, rest_days = parse_schedule(schedule_str)

    if work_days is None:
        await update.message.reply_text("❌ Неверный формат. Используй: /set 3/2")
        return

    # Парсим дату начала
    start_date = datetime.now().date()  # по умолчанию сегодня

    if len(args) > start_idx + 1:
        date_str = args[start_idx + 1]
        parsed_date = parse_date(date_str)
        if parsed_date:
            start_date = parsed_date
        else:
            await update.message.reply_text(
                "❌ Неверный формат даты. Используй: DD.MM.YYYY или DD.MM\n"
                "Пример: /set 3/2 25.03.2026"
            )
            return

    data = load_data()

    data[target_user_id] = {
        "name": target_name,
        "schedule": [work_days, rest_days],
        "start_date": start_date.strftime("%Y-%m-%d"),
        "unemployed": False
    }
    save_data(data)

    # Кто кому назначил
    setter_name = update.effective_user.first_name
    if target_user_id == str(update.effective_user.id):
        # Сам себе
        await update.message.reply_text(
            f"✅ {setter_name} установил график: {work_days}/{rest_days}\n"
            f"Отсчёт начинается с {start_date.strftime('%d.%m.%Y')}"
        )
    elif update.message.reply_to_message:
        # Через reply
        await update.message.reply_text(
            f"✅ {setter_name} установил график {target_name}: {work_days}/{rest_days}\n"
            f"Отсчёт начинается с {start_date.strftime('%d.%m.%Y')}"
        )
    else:
        # Через @username
        await update.message.reply_text(
            f"✅ {setter_name} установил график {target_name}: {work_days}/{rest_days}\n"
            f"Отсчёт начинается с {start_date.strftime('%d.%m.%Y')}"
        )

def parse_date(date_str):
    """Парсит дату в форматах: DD.MM.YYYY, DD.MM, YYYY-MM-DD"""
    formats = ["%d.%m.%Y", "%d.%m", "%Y-%m-%d"]
    
    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            # Если год не указан — используем текущий
            if fmt == "%d.%m":
                parsed = parsed.replace(year=datetime.now().year)
            return parsed.date()
        except ValueError:
            continue
    return None

async def status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    data = load_data()
    today = datetime.now().date()

    # Если в чате — показываем всех участников
    chat_id = context.bot_data.get('chat_id')
    if chat_id and update.message.chat.type in ['group', 'supergroup']:
        try:
            members = await context.bot.get_chat_members(chat_id)
            # Добавляем новых участников если их нет
            for member in members:
                if member.user.is_bot:
                    continue
                uid = str(member.user.id)
                if uid not in data:
                    data[uid] = {
                        "name": member.user.first_name,
                        "unemployed": True
                    }
            save_data(data)
        except Exception:
            pass

    if not data:
        await update.message.reply_text("❌ Пока нет пользователей")
        return

    workers = []
    resting = []
    unemployed = []

    for uid, info in data.items():
        name = info.get("name", "Неизвестно")

        if info.get("unemployed", False) or "schedule" not in info:
            unemployed.append(name)
            continue

        work_days, rest_days = info["schedule"]
        start_date = datetime.strptime(info["start_date"], "%Y-%m-%d").date()

        if get_day_status(work_days, rest_days, start_date, today) == "work":
            # Считаем сколько дней ещё работать до выходного
            delta = (today - start_date).days
            cycle = work_days + rest_days
            day_in_cycle = delta % cycle
            days_left = work_days - day_in_cycle - 1
            workers.append((name, days_left))
        else:
            # Считаем сколько дней ещё отдыхать
            delta = (today - start_date).days
            cycle = work_days + rest_days
            day_in_cycle = delta % cycle
            days_left = (work_days + rest_days) - day_in_cycle - 1
            resting.append((name, days_left))

    # Формируем дату
    weekdays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
    months = ["января", "февраля", "марта", "апреля", "мая", "июня", 
              "июля", "августа", "сентября", "октября", "ноября", "декабря"]
    
    weekday = weekdays[today.weekday()]
    day_num = f"{today.day} {months[today.month - 1]}"
    
    response = f"Сегодня – {weekday} {day_num}\n\n"

    # Добавляем ближайший общий выходной
    common_date = find_common_day_off(data, today)
    if common_date:
        common_weekday = weekdays[common_date.weekday()]
        common_day_num = f"{common_date.day} {months[common_date.month - 1]}"
        if common_date == today:
            response += f"<tg-emoji emoji-id=\"{EMOJI_COMMON_OFF}\">🚬</tg-emoji> Сегодня у всех выходной!\n\n"
        else:
            response += f"<tg-emoji emoji-id=\"{EMOJI_COMMON_OFF}\">🚬</tg-emoji> Общий выходной – {common_weekday} {common_day_num}\n\n"

    if resting:
        response += f"<tg-emoji emoji-id=\"{EMOJI_REST}\">👀</tg-emoji> Выходной:\n" + "\n".join(f"— {name} • {days} дн." for name, days in resting) + "\n\n"

    if workers:
        response += f"<tg-emoji emoji-id=\"{EMOJI_WORK}\">🏃‍♂️</tg-emoji> Работают:\n" + "\n".join(f"— {name} • {days} дн." for name, days in workers) + "\n\n"

    if unemployed:
        response += f"<tg-emoji emoji-id=\"{EMOJI_UNEMPLOYED}\">😎</tg-emoji> БЫТЬ БОГАТЫМ АХУЕННАААА:\n" + "\n".join(f"— {name}" for name in unemployed) + "\n\n"

    if not workers and not resting and not unemployed:
        response += "Нет данных"

    await update.message.reply_text(response.strip(), parse_mode='HTML')

async def common_dayoff(update: Update, context: ContextTypes.DEFAULT_TYPE):
    data = load_data()
    today = datetime.now().date()
    
    common_date = find_common_day_off(data, today)
    
    if common_date is None:
        await update.message.reply_text("❌ Не удалось найти ближайший общий выходной")
        return
    
    if common_date == today:
        await update.message.reply_text("🎉 Сегодня у всех выходной!")
    else:
        await update.message.reply_text(
            f"🎉 Ближайший общий выходной: {common_date.strftime('%d.%m.%Y')} "
            f"({common_date.strftime('%A')})"
        )

async def set_unemployed(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()
    
    if user_id not in data:
        await update.message.reply_text("❌ Сначала установи график: /set 3/2")
        return
    
    data[user_id]["unemployed"] = True
    save_data(data)
    
    await update.message.reply_text("😎 Теперь ты безработный! Отдыхай!")

async def set_work(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()

    if user_id not in data:
        await update.message.reply_text("❌ Сначала установи график: /set 3/2")
        return

    data[user_id]["unemployed"] = False
    save_data(data)

    await update.message.reply_text("✅ Ты снова в строю!")

async def get_emoji_id(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Отвечает ID кастомного эмодзи"""
    custom_emoji_id = None
    
    if update.message.entities:
        for entity in update.message.entities:
            if entity.type == 'custom_emoji':
                custom_emoji_id = entity.custom_emoji_id
                break
    
    if custom_emoji_id:
        await update.message.reply_text(
            f"Emoji: <code>{update.message.text}</code>\n"
            f"ID: <code>{custom_emoji_id}</code>",
            parse_mode='HTML'
        )
    else:
        await update.message.reply_text("❌ Здесь нет кастомного эмодзи")

def main():
    from telegram.ext import MessageHandler, filters
    
    app = Application.builder().token(TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("set", set_schedule))
    app.add_handler(CommandHandler("status", status))
    app.add_handler(CommandHandler("dayoff", common_dayoff))
    app.add_handler(CommandHandler("unemployed", set_unemployed))
    app.add_handler(CommandHandler("work", set_work))
    app.add_handler(CommandHandler("sync", sync_chat_members))
    
    # Хэндлер для получения ID эмодзи
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, get_emoji_id))

    print("Бот запущен...")
    app.run_polling()

if __name__ == "__main__":
    main()
