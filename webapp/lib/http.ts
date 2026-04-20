import "server-only";
import { getSession } from "./session";

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function bad(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

function parseAdminIds(): Set<number> {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  const ids = raw
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return new Set(ids);
}

export function isAdmin(uid: number): boolean {
  return parseAdminIds().has(uid);
}

export async function authed(): Promise<
  | { ok: true; uid: number; name: string; admin: boolean }
  | { ok: false; response: Response }
> {
  const s = await getSession();
  if (!s) return { ok: false, response: bad("unauthorized", 401) };
  return { ok: true, uid: s.uid, name: s.name, admin: isAdmin(s.uid) };
}

export async function adminOnly(): Promise<
  | { ok: true; uid: number; name: string }
  | { ok: false; response: Response }
> {
  const a = await authed();
  if (!a.ok) return a;
  if (!a.admin) return { ok: false, response: bad("admin only", 403) };
  return { ok: true, uid: a.uid, name: a.name };
}
