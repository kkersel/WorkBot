import { authed, bad, json } from "@/lib/http";
import { addVacation, fetchVacationsFull } from "@/lib/queries";
import { z } from "zod";

export async function GET(): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;
  const rows = await fetchVacationsFull(a.uid);
  return json({ vacations: rows });
}

const schema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().max(120).optional().nullable(),
});

export async function POST(req: Request): Promise<Response> {
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
  if (parsed.data.end_date < parsed.data.start_date) return bad("end_date < start_date");

  const id = await addVacation(
    a.uid,
    parsed.data.start_date,
    parsed.data.end_date,
    parsed.data.label ?? null,
  );
  return json({ ok: true, id });
}
