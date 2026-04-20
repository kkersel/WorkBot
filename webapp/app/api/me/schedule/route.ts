import { authed, bad, json } from "@/lib/http";
import {
  setScheduleCustom,
  setScheduleCycle,
  setScheduleUnemployed,
  setScheduleWeekly,
} from "@/lib/queries";
import { z } from "zod";

const cycleSchema = z.object({
  type: z.literal("cycle"),
  work_days: z.number().int().positive().max(30),
  rest_days: z.number().int().min(0).max(30),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  respect_holidays: z.boolean().default(true),
});

const weeklySchema = z.object({
  type: z.literal("weekly"),
  weekly_mask: z.number().int().min(0).max(127),
  respect_holidays: z.boolean().default(true),
  label: z.string().optional().nullable(),
});

const unemployedSchema = z.object({ type: z.literal("unemployed") });
const customSchema = z.object({ type: z.literal("custom") });

const schema = z.union([cycleSchema, weeklySchema, unemployedSchema, customSchema]);

export async function PUT(req: Request): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("invalid json");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "invalid body");

  const p = parsed.data;
  if (p.type === "cycle") {
    if (p.work_days + p.rest_days === 0) return bad("cycle cannot be 0/0");
    await setScheduleCycle(a.uid, p.work_days, p.rest_days, p.start_date, p.respect_holidays);
  } else if (p.type === "weekly") {
    await setScheduleWeekly(a.uid, p.weekly_mask, p.respect_holidays, p.label ?? null);
  } else if (p.type === "unemployed") {
    await setScheduleUnemployed(a.uid);
  } else {
    await setScheduleCustom(a.uid);
  }

  return json({ ok: true });
}
