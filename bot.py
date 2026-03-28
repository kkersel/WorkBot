import os
import json
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Московское время (UTC+3)
MSK = timezone(timedelta(hours=3))
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

# Дни зала: ключ — weekday() (0=пн), значение — подпись или None
GYM_DAYS = {1: None, 3: "Ноги", 5: None}  # вт, чт (ноги), сб

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

def find_next_common_gym_day(data, today):
    """Ищет ближайший день зала (вт/чт/сб), когда все gym=True свободны."""
    gym_users = {uid: info for uid, info in data.items() if info.get("gym", False)}
    if not gym_users:
        return None

    scheduled_gym = {
        uid: info for uid, info in gym_users.items()
        if "schedule" in info and not info.get("unemployed", False)
    }

    for i in range(365):
        check_date = today + timedelta(days=i)
        if check_date.weekday() not in GYM_DAYS:
            continue
        all_free = all(
            get_day_status(
                info["schedule"][0], info["schedule"][1],
                datetime.strptime(info["start_date"], "%Y-%m-%d").date(),
                check_date
            ) == "rest"
            for info in scheduled_gym.values()
        )
        if all_free:
            return check_date, GYM_DAYS[check_date.weekday()]

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
        "/sync — синхронизировать участников чата\n"
        "/gum — записаться/отписаться от зала (Вт/Чт/Сб)"
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
    start_date = datetime.now(MSK).date()  # по умолчанию сегодня

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
                parsed = parsed.replace(year=datetime.now(MSK).year)
            return parsed.date()
        except ValueError:
            continue
    return None

async def status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    data = load_data()
    today = datetime.now(MSK).date()

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
        delta = (today - start_date).days
        cycle = work_days + rest_days
        day_in_cycle = delta % cycle
        schedule_str = f"{work_days}/{rest_days}"

        if get_day_status(work_days, rest_days, start_date, today) == "work":
            days_left = work_days - day_in_cycle - 1
            workers.append((name, days_left, schedule_str))
        else:
            days_left = cycle - day_in_cycle - 1
            resting.append((name, days_left, schedule_str))

    # Формируем дату
    weekdays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
    short_weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    months = ["января", "февраля", "марта", "апреля", "мая", "июня",
              "июля", "августа", "сентября", "октября", "ноября", "декабря"]

    weekday = weekdays[today.weekday()]
    day_num = f"{today.day} {months[today.month - 1]}"

    response = f"📅 <b>{weekday}, {day_num}</b>\n"
    response += "━━━━━━━━━━━━━━━━━━━━\n"

    # Добавляем ближайший общий выходной
    common_date = find_common_day_off(data, today)
    if common_date:
        common_weekday = weekdays[common_date.weekday()]
        common_day_num = f"{common_date.day} {months[common_date.month - 1]}"
        if common_date == today:
            response += f"\n<tg-emoji emoji-id=\"{EMOJI_COMMON_OFF}\">🚬</tg-emoji> <b>Сегодня у всех выходной!</b>\n"
        else:
            days_until = (common_date - today).days
            response += f"\n<tg-emoji emoji-id=\"{EMOJI_COMMON_OFF}\">🚬</tg-emoji> Общий выходной — <b>{common_weekday}, {common_day_num}</b> (через {days_until} дн.)\n"

    if resting:
        response += f"\n<tg-emoji emoji-id=\"{EMOJI_REST}\">👀</tg-emoji> <b>Выходной:</b>\n"
        for name, days, sched in resting:
            if days == 0:
                response += f"  {name} <i>({sched})</i> — последний день\n"
            else:
                response += f"  {name} <i>({sched})</i> — ещё {days} дн.\n"

    if workers:
        response += f"\n<tg-emoji emoji-id=\"{EMOJI_WORK}\">🏃‍♂️</tg-emoji> <b>Работают:</b>\n"
        for name, days, sched in workers:
            if days == 0:
                response += f"  {name} <i>({sched})</i> — последний день\n"
            else:
                response += f"  {name} <i>({sched})</i> — ещё {days} дн.\n"

    if unemployed:
        response += f"\n<tg-emoji emoji-id=\"{EMOJI_UNEMPLOYED}\">😎</tg-emoji> <b>БЫТЬ БОГАТЫМ АХУЕННАААА:</b>\n"
        for name in unemployed:
            response += f"  {name}\n"

    if not workers and not resting and not unemployed:
        response += "\nНет данных"

    # Блок зала — только если сегодня день зала
    weekday_num = today.weekday()
    if weekday_num in GYM_DAYS:
        label = GYM_DAYS[weekday_num]
        gym_header = f"🏋️ <b>Зал сегодня</b>" + (f" — <b>{label}</b>" if label else "")

        gym_can = []    # gym=True и выходной/безработный
        gym_cant = []   # gym=True и работает

        for uid, info in data.items():
            if not info.get("gym", False):
                continue
            name = info.get("name", "Неизвестно")
            if info.get("unemployed", False) or "schedule" not in info:
                gym_can.append(name)
            else:
                work_days, rest_days = info["schedule"]
                start_date = datetime.strptime(info["start_date"], "%Y-%m-%d").date()
                if get_day_status(work_days, rest_days, start_date, today) == "rest":
                    gym_can.append(name)
                else:
                    gym_cant.append(name)

        if gym_can or gym_cant:
            response += f"\n{gym_header}\n"
            if gym_can and not gym_cant:
                response += "  🎉 Протеин отдай, сука!\n"
            for name in gym_can:
                response += f"  ✅ {name}\n"
            for name in gym_cant:
                response += f"  ❌ {name} (работает)\n"

    # Ближайший общий день зала — показываем всегда
    gym_members_exist = any(info.get("gym", False) for info in data.values())
    if gym_members_exist:
        gym_day_result = find_next_common_gym_day(data, today)
        if gym_day_result:
            next_gym_date, gym_label = gym_day_result
            next_gym_weekday = short_weekdays[next_gym_date.weekday()]
            next_gym_day_num = f"{next_gym_date.day} {months[next_gym_date.month - 1]}"
            if next_gym_date == today:
                response += "\n🏋️ <b>Сегодня все идут в зал!</b>\n"
            else:
                days_until_gym = (next_gym_date - today).days
                label_part = f" ({gym_label})" if gym_label else ""
                response += (
                    f"\n🏋️ Все в зале — <b>{next_gym_weekday}, {next_gym_day_num}</b>"
                    f"{label_part} (через {days_until_gym} дн.)\n"
                )

    await update.message.reply_text(response.strip(), parse_mode='HTML')

async def common_dayoff(update: Update, context: ContextTypes.DEFAULT_TYPE):
    data = load_data()
    today = datetime.now(MSK).date()
    
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

async def toggle_gym(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    name = update.effective_user.first_name
    data = load_data()

    if user_id not in data:
        data[user_id] = {"name": name, "unemployed": True}

    currently = data[user_id].get("gym", False)
    data[user_id]["gym"] = not currently
    data[user_id]["name"] = name
    save_data(data)

    if not currently:
        await update.message.reply_text("🏋️ Истории бати Сени! Вт/Чт/Сб — не пропускай.")
    else:
        await update.message.reply_text("👋 Теперь ты без историй от бати Сени.")

def main():
    app = Application.builder().token(TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("set", set_schedule))
    app.add_handler(CommandHandler("status", status))
    app.add_handler(CommandHandler("dayoff", common_dayoff))
    app.add_handler(CommandHandler("unemployed", set_unemployed))
    app.add_handler(CommandHandler("work", set_work))
    app.add_handler(CommandHandler("sync", sync_chat_members))
    app.add_handler(CommandHandler("gum", toggle_gym))
    
    print("Бот запущен...")
    app.run_polling()

if __name__ == "__main__":
    main()
