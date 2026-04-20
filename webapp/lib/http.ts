import "server-only";
import { getSession } from "./session";

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function bad(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export async function authed(): Promise<
  | { ok: true; uid: number; name: string }
  | { ok: false; response: Response }
> {
  const s = await getSession();
  if (!s) return { ok: false, response: bad("unauthorized", 401) };
  return { ok: true, uid: s.uid, name: s.name };
}
