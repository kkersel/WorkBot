import { authed, json } from "@/lib/http";
import { sql } from "@/lib/db";
import { todayMSK, weekdayMonFirst } from "@/lib/schedule";

/**
 * Who is (potentially) going to the gym today?
 *
 *   GET /api/gym/today
 *
 * Returns:
 *   {
 *     is_gym_day: boolean,      — does anyone have today as a gym day?
 *     date: "YYYY-MM-DD",
 *     weekday: 0..6 (Mon=0),
 *     theme: "ноги" | null,     — label of today from first user's plan
 *     people: [{
 *       user_id, name, photo_url,
 *       attendance: "yes" | "no" | "pending",
 *       label: string | null, optional: boolean
 *     }]
 *   }
 */
export async function GET(): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;

  const date = todayMSK();
  const weekday = weekdayMonFirst(date);
  const wdKey = String(weekday);

  // Gym-enabled users whose plan includes today's weekday
  const users = await sql<
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
      AND g.days ? ${wdKey}
    ORDER BY u.first_name
  `;

  // Existing attendance rows for today
  const attendance = await sql<
    Array<{ user_id: number; going: boolean | null }>
  >/* sql */ `
    SELECT user_id, going FROM gym_attendance WHERE date = ${date}
  `;
  const attMap: Record<number, "yes" | "no"> = {};
  for (const a of attendance) {
    if (a.going === true) attMap[Number(a.user_id)] = "yes";
    else if (a.going === false) attMap[Number(a.user_id)] = "no";
  }

  // Pick theme from any user whose day-entry has a label
  let theme: string | null = null;
  for (const u of users) {
    const entry = u.days[wdKey];
    if (entry?.label) {
      theme = entry.label;
      break;
    }
  }

  return json({
    is_gym_day: users.length > 0,
    date,
    weekday,
    theme,
    people: users.map((u) => {
      const entry = u.days[wdKey] ?? {};
      return {
        user_id: Number(u.user_id),
        name: u.first_name,
        photo_url: u.photo_url,
        attendance: attMap[Number(u.user_id)] ?? "pending",
        label: entry.label || null,
        optional: !!entry.optional,
      };
    }),
  });
}
