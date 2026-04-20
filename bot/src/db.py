from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg

from . import config

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=config.DATABASE_URL,
            min_size=1,
            max_size=5,
            command_timeout=15,
            # Supabase pgbouncer (transaction pooler, port 6543) requires this.
            # Harmless for session pooler / direct connections too.
            statement_cache_size=0,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("db pool not initialized")
    return _pool


@asynccontextmanager
async def conn() -> AsyncIterator[asyncpg.Connection]:
    async with pool().acquire() as c:
        yield c
