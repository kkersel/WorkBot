import logging
import xml.etree.ElementTree as ET
from datetime import date

import httpx

from .. import db

log = logging.getLogger(__name__)

XMLCAL_URL = "https://xmlcalendar.ru/data/ru/{year}/calendar.xml"


async def sync_year(year: int) -> int:
    """Fetch Russian production calendar for a year and upsert into `holidays`."""
    url = XMLCAL_URL.format(year=year)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url)
        r.raise_for_status()
        root = ET.fromstring(r.text)

    rows: list[tuple[date, int, str]] = []
    for day_el in root.findall(".//day"):
        d_str = day_el.attrib.get("d")  # "MM.DD"
        t_str = day_el.attrib.get("t")  # "1" | "2" | "3"
        if not d_str or not t_str:
            continue
        try:
            month, day_num = map(int, d_str.split("."))
            day_type = int(t_str)
            if day_type not in (1, 2, 3):
                continue
            desc = day_el.attrib.get("h", "") or ""
            rows.append((date(year, month, day_num), day_type, desc))
        except (ValueError, KeyError):
            continue

    if not rows:
        log.warning("xmlcalendar returned 0 entries for %s", year)
        return 0

    async with db.conn() as c:
        await c.executemany(
            """
            INSERT INTO holidays (date, day_type, description, country)
            VALUES ($1, $2, $3, 'RU')
            ON CONFLICT (date) DO UPDATE
                SET day_type = EXCLUDED.day_type,
                    description = EXCLUDED.description
            """,
            rows,
        )
    log.info("synced %d calendar entries for %d", len(rows), year)
    return len(rows)


async def load_holidays(year_from: int, year_to: int) -> dict[date, int]:
    async with db.conn() as c:
        rows = await c.fetch(
            "SELECT date, day_type FROM holidays WHERE date BETWEEN $1 AND $2",
            date(year_from, 1, 1),
            date(year_to, 12, 31),
        )
    return {r["date"]: r["day_type"] for r in rows}
