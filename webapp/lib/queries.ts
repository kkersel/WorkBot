import "server-only";
import { sql } from "./db";
import type {
  Override,
  UserSchedule,
  Vacation,
  DayStatus,
} from "./schedule";
import { addDays, dayStatus } from "./schedule";

// ============================================================
// Users
// ============================================================
export type TgUserInput = {
  id: number;
  first_name: string;
  last_name?: string | null;
  username?: string | null;
  language_code?: string | null;
  is_premium?: boolean;
  photo_url?: string | null;
};

export async function upsertUser(u: TgUserInput): Promise<void> {
  await sql/* sql */ `
    INSERT INTO users (id, username, first_name, last_name, language_code, is_premium, photo_url)
    VALUES (${u.id}, ${u.username ?? null}, ${u.first_name}, ${u.last_name ?? null},
            ${u.language_code ?? "ru"}, ${u.is_premium ?? false}, ${u.photo_url ?? null})
    ON CONFLICT (id) DO UPDATE SET
      username      = EXCLUDED.username,
      first_name    = EXCLUDED.first_name,
      last_name     = EXCLUDED.last_name,
      language_code = COALESCE(EXCLUDED.language_code, users.language_code),
      is_premium    = EXCLUDED.is_premium,
      photo_url     = COALESCE(EXCLUDED.photo_url, users.photo_url)
  `;
}

export type UserRow = {
  id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
};

export async function getUser(id: number): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>/* sql */ `
    SELECT id, username, first_name, last_name, photo_url
    FROM users WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

// ============================================================
// Schedules
// ============================================================
type ScheduleRow = {
  user_id: number;
  type: UserSchedule["type"];
  work_days: number | null;
  rest_days: number | null;
  weekly_mask: number | null;
  start_date: Date | null;
  respect_holidays: boolean;
  label: string | null;
};

function rowToSchedule(r: ScheduleRow | undefined): UserSchedule | null {
  if (!r) return null;
  return {
    type: r.type,
    work_days: r.work_days,
    rest_days: r.rest_days,
    weekly_mask: r.weekly_mask,
    start_date: r.start_date ? r.start_date.toISOString().slice(0, 10) : null,
    respect_holidays: r.respect_holidays,
  };
}

export async function fetchSchedule(userId: number): Promise<(UserSchedule & { label: string | null }) | null> {
  const rows = await sql<ScheduleRow[]>/* sql */ `
    SELECT * FROM schedules WHERE user_id = ${userId}
  `;
  const s = rowToSchedule(rows[0]);
  if (!s) return null;
  return { ...s, label: rows[0].label };
}

export async function setScheduleCycle(
  userId: number,
  work: number,
  rest: number,
  start: string,
  respectHolidays = true,
): Promise<void> {
  const label = `${work}/${rest}`;
  await sql/* sql */ `
    INSERT INTO schedules
      (user_id, type, work_days, rest_days, start_date, respect_holidays, label)
    VALUES (${userId}, 'cycle', ${work}, ${rest}, ${start}, ${respectHolidays}, ${label})
    ON CONFLICT (user_id) DO UPDATE SET
      type             = 'cycle',
      work_days        = EXCLUDED.work_days,
      rest_days        = EXCLUDED.rest_days,
      weekly_mask      = NULL,
      start_date       = EXCLUDED.start_date,
      respect_holidays = EXCLUDED.respect_holidays,
      label            = EXCLUDED.label
  `;
}

export async function setScheduleWeekly(
  userId: number,
  mask: number,
  respectHolidays = true,
  label: string | null = null,
): Promise<void> {
  await sql/* sql */ `
    INSERT INTO schedules
      (user_id, type, weekly_mask, respect_holidays, label)
    VALUES (${userId}, 'weekly', ${mask}, ${respectHolidays}, ${label})
    ON CONFLICT (user_id) DO UPDATE SET
      type             = 'weekly',
      weekly_mask      = EXCLUDED.weekly_mask,
      work_days        = NULL,
      rest_days        = NULL,
      start_date       = NULL,
      respect_holidays = EXCLUDED.respect_holidays,
      label            = EXCLUDED.label
  `;
}

export async function setScheduleUnemployed(userId: number): Promise<void> {
  await sql/* sql */ `
    INSERT INTO schedules (user_id, type, label)
    VALUES (${userId}, 'unemployed', 'безработный')
    ON CONFLICT (user_id) DO UPDATE SET
      type = 'unemployed', label = 'безработный',
      work_days = NULL, rest_days = NULL, weekly_mask = NULL, start_date = NULL
  `;
}

export async function setScheduleCustom(userId: number): Promise<void> {
  await sql/* sql */ `
    INSERT INTO schedules (user_id, type, label)
    VALUES (${userId}, 'custom', 'кастомный')
    ON CONFLICT (user_id) DO UPDATE SET
      type = 'custom', label = 'кастомный',
      work_days = NULL, rest_days = NULL, weekly_mask = NULL, start_date = NULL
  `;
}

// ============================================================
// Overrides
// ============================================================
type OverrideRow = { date: Date; is_work: boolean; note: string | null };

export async function fetchOverrides(
  userId: number,
  from: string,
  to: string,
): Promise<Override[]> {
  const rows = await sql<OverrideRow[]>/* sql */ `
    SELECT date, is_work, note
    FROM schedule_overrides
    WHERE user_id = ${userId} AND date BETWEEN ${from} AND ${to}
    ORDER BY date
  `;
  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    is_work: r.is_work,
  }));
}

export async function upsertOverride(
  userId: number,
  d: string,
  isWork: boolean,
  note: string | null = null,
): Promise<void> {
  await sql/* sql */ `
    INSERT INTO schedule_overrides (user_id, date, is_work, note)
    VALUES (${userId}, ${d}, ${isWork}, ${note})
    ON CONFLICT (user_id, date) DO UPDATE SET
      is_work = EXCLUDED.is_work, note = EXCLUDED.note
  `;
}

export async function deleteOverride(userId: number, d: string): Promise<void> {
  await sql/* sql */ `
    DELETE FROM schedule_overrides WHERE user_id = ${userId} AND date = ${d}
  `;
}

// ============================================================
// Vacations
// ============================================================
type VacationRow = {
  id: number;
  start_date: Date;
  end_date: Date;
  label: string | null;
};

export async function fetchVacations(userId: number): Promise<Vacation[]> {
  const rows = await sql<VacationRow[]>/* sql */ `
    SELECT id, start_date, end_date, label
    FROM vacations WHERE user_id = ${userId} ORDER BY start_date
  `;
  return rows.map((r) => ({
    start_date: r.start_date.toISOString().slice(0, 10),
    end_date: r.end_date.toISOString().slice(0, 10),
  }));
}

export async function fetchVacationsFull(
  userId: number,
): Promise<{ id: number; start_date: string; end_date: string; label: string | null }[]> {
  const rows = await sql<VacationRow[]>/* sql */ `
    SELECT id, start_date, end_date, label
    FROM vacations WHERE user_id = ${userId} ORDER BY start_date
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    start_date: r.start_date.toISOString().slice(0, 10),
    end_date: r.end_date.toISOString().slice(0, 10),
    label: r.label,
  }));
}

export async function addVacation(
  userId: number,
  start: string,
  end: string,
  label: string | null = null,
): Promise<number> {
  const rows = await sql<{ id: number }[]>/* sql */ `
    INSERT INTO vacations (user_id, start_date, end_date, label)
    VALUES (${userId}, ${start}, ${end}, ${label}) RETURNING id
  `;
  return Number(rows[0].id);
}

export async function deleteVacation(userId: number, vacId: number): Promise<boolean> {
  const rows = await sql<{ id: number }[]>/* sql */ `
    DELETE FROM vacations WHERE id = ${vacId} AND user_id = ${userId} RETURNING id
  `;
  return rows.length > 0;
}

// ============================================================
// Gym
// ============================================================
export type GymDays = Record<string, { label?: string; optional?: boolean }>;
export type GymPlan = {
  user_id: number;
  enabled: boolean;
  days: GymDays;
  evening_poll: boolean;
  poll_hour_msk: number;
};

export const DEFAULT_GYM_DAYS: GymDays = {
  "1": { label: "", optional: false }, // Tue
  "3": { label: "ноги", optional: true }, // Thu
  "5": { label: "", optional: false }, // Sat
  "6": { label: "", optional: false }, // Sun
};

export async function getGymPlan(userId: number): Promise<GymPlan | null> {
  const rows = await sql<GymPlan[]>/* sql */ `
    SELECT user_id, enabled, days, evening_poll, poll_hour_msk
    FROM gym_plan WHERE user_id = ${userId}
  `;
  return rows[0] ?? null;
}

export async function setGymPlan(
  userId: number,
  enabled: boolean,
  days: GymDays = DEFAULT_GYM_DAYS,
  eveningPoll = true,
  pollHour = 20,
): Promise<void> {
  await sql/* sql */ `
    INSERT INTO gym_plan (user_id, enabled, days, evening_poll, poll_hour_msk)
    VALUES (${userId}, ${enabled}, ${sql.json(days)}, ${eveningPoll}, ${pollHour})
    ON CONFLICT (user_id) DO UPDATE SET
      enabled       = EXCLUDED.enabled,
      days          = EXCLUDED.days,
      evening_poll  = EXCLUDED.evening_poll,
      poll_hour_msk = EXCLUDED.poll_hour_msk
  `;
}

// ============================================================
// Holidays
// ============================================================
type HolidayRow = { date: Date; day_type: number };

export async function loadHolidays(
  yearFrom: number,
  yearTo: number,
): Promise<Record<string, number>> {
  const from = `${yearFrom}-01-01`;
  const to = `${yearTo}-12-31`;
  const rows = await sql<HolidayRow[]>/* sql */ `
    SELECT date, day_type FROM holidays WHERE date BETWEEN ${from} AND ${to}
  `;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.date.toISOString().slice(0, 10)] = r.day_type;
  return out;
}

// ============================================================
// Wide reads for /status etc.
// ============================================================
type WideRow = {
  id: number;
  first_name: string;
  username: string | null;
  photo_url: string | null;
  type: UserSchedule["type"] | null;
  work_days: number | null;
  rest_days: number | null;
  weekly_mask: number | null;
  start_date: Date | null;
  respect_holidays: boolean | null;
  label: string | null;
};

export async function fetchAllUsersWithSchedules(): Promise<
  {
    id: number;
    name: string;
    username: string | null;
    photo_url: string | null;
    schedule: UserSchedule;
    label: string | null;
  }[]
> {
  const rows = await sql<WideRow[]>/* sql */ `
    SELECT u.id, u.first_name, u.username, u.photo_url,
           s.type, s.work_days, s.rest_days, s.weekly_mask,
           s.start_date, s.respect_holidays, s.label
    FROM users u
    LEFT JOIN schedules s ON s.user_id = u.id
    ORDER BY u.first_name
  `;
  return rows.map((u) => ({
    id: Number(u.id),
    name: u.first_name,
    username: u.username,
    photo_url: u.photo_url,
    schedule: {
      type: u.type ?? "unemployed",
      work_days: u.work_days,
      rest_days: u.rest_days,
      weekly_mask: u.weekly_mask,
      start_date: u.start_date ? u.start_date.toISOString().slice(0, 10) : null,
      respect_holidays: u.respect_holidays ?? true,
    },
    label: u.label,
  }));
}

export async function fetchOverridesOn(d: string): Promise<Record<number, boolean>> {
  const rows = await sql<{ user_id: number; is_work: boolean }[]>/* sql */ `
    SELECT user_id, is_work FROM schedule_overrides WHERE date = ${d}
  `;
  const out: Record<number, boolean> = {};
  for (const r of rows) out[Number(r.user_id)] = r.is_work;
  return out;
}

export async function fetchActiveVacationsOn(d: string): Promise<Set<number>> {
  const rows = await sql<{ user_id: number }[]>/* sql */ `
    SELECT DISTINCT user_id FROM vacations
    WHERE start_date <= ${d} AND end_date >= ${d}
  `;
  return new Set(rows.map((r) => Number(r.user_id)));
}

// ============================================================
// Composed "today" view — mirrors bot/src/services/status_view.py
// ============================================================
export type UserDayView = {
  user_id: number;
  name: string;
  username: string | null;
  photo_url: string | null;
  label: string | null;
  status: DayStatus;
};

export async function computeDay(d: string): Promise<UserDayView[]> {
  const year = Number(d.slice(0, 4));
  const [users, holidays, overridesToday, onVacation] = await Promise.all([
    fetchAllUsersWithSchedules(),
    loadHolidays(year, year),
    fetchOverridesOn(d),
    fetchActiveVacationsOn(d),
  ]);

  return users.map((u) => {
    const ovrs = u.id in overridesToday ? [{ date: d, is_work: overridesToday[u.id] }] : [];
    const vacs = onVacation.has(u.id) ? [{ start_date: d, end_date: d }] : [];
    const st = dayStatus(d, u.schedule, ovrs, vacs, holidays);
    return {
      user_id: u.id,
      name: u.name,
      username: u.username,
      photo_url: u.photo_url,
      label: u.label,
      status: st,
    };
  });
}

export async function findNextCommonOff(
  today: string,
  horizonDays = 180,
): Promise<string | null> {
  for (let i = 0; i <= horizonDays; i++) {
    const iso = addDays(today, i);
    const views = await computeDay(iso);
    const hasSchedule = views.some((v) => v.status !== "unemployed");
    if (!hasSchedule) continue;
    if (
      views.every(
        (v) =>
          v.status === "rest" ||
          v.status === "vacation" ||
          v.status === "holiday" ||
          v.status === "unemployed",
      )
    ) {
      return iso;
    }
  }
  return null;
}
