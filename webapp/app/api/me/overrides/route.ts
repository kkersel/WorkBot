import { authed, bad, json } from "@/lib/http";
import { deleteOverride, fetchOverrides, upsertOverride } from "@/lib/queries";
import { z } from "zod";

export async function GET(req: Request): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return bad("need from & to (YYYY-MM-DD)");
  }
  const rows = await fetchOverrides(a.uid, from, to);
  return json({ overrides: rows });
}

const upsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_work: z.boolean(),
  note: z.string().max(200).optional().nullable(),
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
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "invalid body");

  await upsertOverride(a.uid, parsed.data.date, parsed.data.is_work, parsed.data.note ?? null);
  return json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("need date");
  await deleteOverride(a.uid, date);
  return json({ ok: true });
}
