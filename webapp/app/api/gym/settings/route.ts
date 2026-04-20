import { sql } from "@/lib/db";
import { adminOnly, authed, bad, json } from "@/lib/http";
import { z } from "zod";

/**
 * Global gym settings (stored in `kv` under key "gym.settings").
 *   {
 *     poll_hour_msk: 20,   // hour (0..23) when the bot asks everyone
 *   }
 *
 * GET — любой авторизованный видит настройки (чтобы в UI показать
 *        текущее время) + флаг can_edit (true только у админов).
 * PUT — admin only.
 */

const KEY = "gym.settings";
const DEFAULT = { poll_hour_msk: 20 };

const schema = z.object({
  poll_hour_msk: z.number().int().min(0).max(23),
});

async function readSettings(): Promise<{ poll_hour_msk: number }> {
  const rows = await sql<{ value: unknown }[]>/* sql */ `
    SELECT value FROM kv WHERE key = ${KEY}
  `;
  const raw = rows[0]?.value as { poll_hour_msk?: number } | null;
  if (!raw) return DEFAULT;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return DEFAULT;
  return parsed.data;
}

export async function GET(): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;
  const settings = await readSettings();
  return json({ settings, can_edit: a.admin });
}

export async function PUT(req: Request): Promise<Response> {
  const a = await adminOnly();
  if (!a.ok) return a.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return bad("invalid json");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "bad body");

  await sql/* sql */ `
    INSERT INTO kv (key, value) VALUES (${KEY}, ${sql.json(parsed.data)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return json({ ok: true, settings: parsed.data });
}
