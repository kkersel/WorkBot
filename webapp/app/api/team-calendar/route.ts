import { authed, bad, json } from "@/lib/http";
import {
  fetchAllUsersWithSchedules,
  loadHolidays,
} from "@/lib/queries";
import { dayStatus, type DayStatus } from "@/lib/schedule";
import { sql } from "@/lib/db";

/**
 * Wide read for the team calendar.
 * Returns per-day statuses for every known user in one shot.
 *
 * Query: /api/team-calendar?year=2026&month=4   (1-based month)
 */
export async function GET(req: Request): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month")); // 1..12
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return bad("bad year/month");
  }

  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const [users, holidays, overrides, vacations] = await Promise.all([
    fetchAllUsersWithSchedules(),
    loadHolidays(year, year),
    sql<{ user_id: number; date: Date; is_work: boolean }[]>/* sql */ `
      SELECT user_id, date, is_work FROM schedule_overrides
      WHERE date BETWEEN ${from} AND ${to}
    `,
    sql<{ user_id: number; start_date: Date; end_date: Date }[]>/* sql */ `
      SELECT user_id, start_date, end_date FROM vacations
      WHERE start_date <= ${to} AND end_date >= ${from}
    `,
  ]);

  const overridesByUser: Record<number, Record<string, boolean>> = {};
  for (const o of overrides) {
    const d = o.date.toISOString().slice(0, 10);
    (overridesByUser[Number(o.user_id)] ??= {})[d] = o.is_work;
  }

  const vacationsByUser: Record<number, { start: string; end: string }[]> = {};
  for (const v of vacations) {
    (vacationsByUser[Number(v.user_id)] ??= []).push({
      start: v.start_date.toISOString().slice(0, 10),
      end: v.end_date.toISOString().slice(0, 10),
    });
  }

  // Return a matrix: { "YYYY-MM-DD": [{user_id, status, ...}, ...] }
  const matrix: Record<string, { user_id: number; status: DayStatus }[]> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    matrix[iso] = users.map((u) => {
      const ovrMap = overridesByUser[u.id];
      const ovrArr = ovrMap && iso in ovrMap ? [{ date: iso, is_work: ovrMap[iso] }] : [];
      const vacs = (vacationsByUser[u.id] ?? [])
        .filter((v) => v.start <= iso && iso <= v.end)
        .map((v) => ({ start_date: v.start, end_date: v.end }));
      const st = dayStatus(iso, u.schedule, ovrArr, vacs, holidays);
      return { user_id: u.id, status: st };
    });
  }

  return json({
    year,
    month,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      photo_url: u.photo_url,
      label: u.label,
    })),
    holidays,
    matrix,
  });
}
