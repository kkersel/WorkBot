import { json } from "@/lib/http";
import { clearSessionCookie } from "@/lib/session";

export async function POST(): Promise<Response> {
  await clearSessionCookie();
  return json({ ok: true });
}
