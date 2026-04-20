import { sql } from "@/lib/db";
import { authed, bad, json } from "@/lib/http";
import { computeDay } from "@/lib/queries";
import { addDays, todayMSK, weekdayMonFirst } from "@/lib/schedule";

/**
 * Upcoming gym days within the next N days (default 14).
 *
 * Returns only days where at least one gym-enabled user has that weekday
 * in their plan, with per-user attendance and avatars.
 *
 *   GET /api/gym/upcoming?days=14
 */
export async function GET(req: Request): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;

  const url = new URL(req.url);
  const horizon = Math.max(1, Math.min(60, Number(url.searchParams.get("days") ?? 14)));

  // All gym-enabled users
  const gymUsers = await sql<
    Array<{
      user_id: number;
      first_name: string;
      photo_url: string | null;
      days: Record<string, { label?: string; optional?: boolean }>;
    }>
  >/* sql */ `
    SELECT g.user_id, u.first_name, u.photo_url, g.days
    FROM gym_plan g
    JOIN users u ON u.id = g.user_id
    WHERE g.enabled = true
  `;
  if (gymUsers.length === 0) return json({ days: [] });

  const today = todayMSK();
  const endDate = addDays(today, horizon);

  // All attendance within window
  const attendance = await sql<
    Array<{ user_id: number; date: Date; going: boolean | null }>
  >/* sql */ `
    SELECT user_id, date, going FROM gym_attendance
    WHERE date BETWEEN ${today} AND ${endDate}
  `;
  const attMap: Record<string, Record<number, "yes" | "no">> = {};
  for (const a of attendance) {
    const d = a.date.toISOString().slice(0, 10);
    (attMap[d] ??= {});
    if (a.going === true) attMap[d][Number(a.user_id)] = "yes";
    else if (a.going === false) attMap[d][Number(a.user_id)] = "no";
  }

  // Pre-compute status-by-date only for those days that actually have gym
  const out: Array<{
    date: string;
    weekday: number;
    theme: string | null;
    people: Array<{
      user_id: number;
      name: string;
      photo_url: string | null;
      attendance: "yes" | "no" | "pending";
      label: string | null;
      optional: boolean;
    }>;
  }> = [];

  for (let i = 0; i < horizon; i++) {
    const iso = addDays(today, i);
    const wd = weekdayMonFirst(iso);
    const wdKey = String(wd);

    const dayUsers = gymUsers.filter((u) => wdKey in u.days);
    if (dayUsers.length === 0) continue;

    // Filter out those working that day (expensive but accurate)
    const views = await computeDay(iso);
    const statusById: Record<number, string> = {};
    for (const v of views) statusById[v.user_id] = v.status;

    const people = dayUsers
      .filter((u) => statusById[u.user_id] !== "work")
      .map((u) => {
        const entry = u.days[wdKey] ?? {};
        const att = attMap[iso]?.[Number(u.user_id)];
        return {
          user_id: Number(u.user_id),
          name: u.first_name,
          photo_url: u.photo_url,
          attendance: (att ?? "pending") as "yes" | "no" | "pending",
          label: entry.label || null,
          optional: !!entry.optional,
        };
      });

    if (people.length === 0) continue;

    const theme = people.find((p) => p.label)?.label ?? null;

    out.push({ date: iso, weekday: wd, theme, people });
  }

  return json({ days: out });
}
