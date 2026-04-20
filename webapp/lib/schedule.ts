/**
 * Mirrors bot/src/services/schedule_engine.py — must stay in sync.
 */

export type DayStatus = "work" | "rest" | "vacation" | "holiday" | "unemployed";
export type ScheduleType = "cycle" | "weekly" | "custom" | "unemployed";

export type UserSchedule = {
  type: ScheduleType;
  work_days?: number | null;
  rest_days?: number | null;
  weekly_mask?: number | null; // bit 0 = Mon .. bit 6 = Sun
  start_date?: string | null; // YYYY-MM-DD
  respect_holidays: boolean;
};

export type Vacation = { start_date: string; end_date: string };
export type Override = { date: string; is_work: boolean };

const MS_PER_DAY = 86_400_000;

function toDateOnly(iso: string): Date {
  // Parse as UTC midnight to avoid TZ drift
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function diffDays(a: string, b: string): number {
  return Math.round((toDateOnly(a).getTime() - toDateOnly(b).getTime()) / MS_PER_DAY);
}

export function weekdayMonFirst(iso: string): number {
  // JS: 0 = Sun .. 6 = Sat; we want 0 = Mon .. 6 = Sun
  const js = toDateOnly(iso).getUTCDay();
  return (js + 6) % 7;
}

export function addDays(iso: string, n: number): string {
  const d = toDateOnly(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayMSK(): string {
  const now = new Date();
  // Moscow is UTC+3 (no DST)
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return msk.toISOString().slice(0, 10);
}

function inVacation(d: string, vacs: Vacation[]): boolean {
  return vacs.some((v) => v.start_date <= d && d <= v.end_date);
}

/**
 * day_type: 1 = non-working holiday, 2 = short day, 3 = moved working weekend
 */
export function dayStatus(
  d: string,
  s: UserSchedule,
  overrides: Override[],
  vacations: Vacation[],
  holidays: Record<string, number>,
): DayStatus {
  if (inVacation(d, vacations)) return "vacation";

  const hType = holidays[d];
  if (s.respect_holidays && hType === 1) return "holiday";

  for (const o of overrides) {
    if (o.date === d) return o.is_work ? "work" : "rest";
  }

  if (s.type === "unemployed") return "unemployed";

  if (s.type === "cycle") {
    if (!s.start_date || !s.work_days || s.rest_days == null) return "rest";
    const delta = diffDays(d, s.start_date);
    if (delta < 0) return "rest";
    const cycle = s.work_days + s.rest_days;
    if (cycle === 0) return "rest";
    return delta % cycle < s.work_days ? "work" : "rest";
  }

  if (s.type === "weekly") {
    if (s.weekly_mask == null) return "rest";
    if (s.respect_holidays && hType === 3) return "work";
    const bit = 1 << weekdayMonFirst(d);
    return (s.weekly_mask & bit) !== 0 ? "work" : "rest";
  }

  return "rest";
}

export function weeklyMaskFromDays(days: number[]): number {
  let m = 0;
  for (const d of days) if (d >= 0 && d <= 6) m |= 1 << d;
  return m;
}

export function daysFromWeeklyMask(mask: number): number[] {
  const out: number[] = [];
  for (let d = 0; d < 7; d++) if (mask & (1 << d)) out.push(d);
  return out;
}
