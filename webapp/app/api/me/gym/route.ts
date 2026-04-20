import { authed, bad, json } from "@/lib/http";
import { DEFAULT_GYM_DAYS, getGymPlan, setGymPlan } from "@/lib/queries";
import { z } from "zod";

export async function GET(): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;
  const plan = await getGymPlan(a.uid);
  return json({ plan: plan ?? { user_id: a.uid, enabled: false, days: DEFAULT_GYM_DAYS, evening_poll: true, poll_hour_msk: 20 } });
}

const dayShape = z.object({ label: z.string().max(60).optional(), optional: z.boolean().optional() });
const schema = z.object({
  enabled: z.boolean(),
  days: z.record(z.string().regex(/^[0-6]$/), dayShape).optional(),
  evening_poll: z.boolean().optional(),
  poll_hour_msk: z.number().int().min(0).max(23).optional(),
});

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

  const existing = await getGymPlan(a.uid);
  const days = parsed.data.days ?? existing?.days ?? DEFAULT_GYM_DAYS;
  const eveningPoll = parsed.data.evening_poll ?? existing?.evening_poll ?? true;
  const pollHour = parsed.data.poll_hour_msk ?? existing?.poll_hour_msk ?? 20;

  await setGymPlan(a.uid, parsed.data.enabled, days, eveningPoll, pollHour);
  return json({ ok: true });
}
