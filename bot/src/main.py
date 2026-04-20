import asyncio
import logging

from . import config, db
from .bot import bot, dp
from .handlers import start, status, schedule, gym, invite, vacation, sync
from .services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("workbot")


async def main() -> None:
    config.validate()
    await db.init_pool()

    for mod in (start, status, schedule, gym, invite, vacation, sync):
        dp.include_router(mod.router)

    scheduler = start_scheduler(bot)
    try:
        log.info("bot polling started")
        await dp.start_polling(bot)
    finally:
        stop_scheduler(scheduler)
        await db.close_pool()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
