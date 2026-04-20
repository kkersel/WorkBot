import { bad, json } from "@/lib/http";
import { upsertUser } from "@/lib/queries";
import { setSessionCookie } from "@/lib/session";
import { verifyInitData } from "@/lib/tg";

export async function POST(req: Request): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return bad("server misconfigured: TELEGRAM_BOT_TOKEN missing", 500);

  let body: { initData?: string };
  try {
    body = (await req.json()) as { initData?: string };
  } catch {
    return bad("invalid json");
  }
  if (!body.initData) return bad("missing initData");

  const verified = verifyInitData(body.initData, token);
  if (!verified) return bad("invalid initData", 401);

  const u = verified.user;
  await upsertUser({
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name ?? null,
    username: u.username ?? null,
    language_code: u.language_code ?? "ru",
    is_premium: !!u.is_premium,
    photo_url: u.photo_url ?? null,
  });

  await setSessionCookie(u.id, u.first_name);
  return json({ ok: true, user: { id: u.id, first_name: u.first_name, username: u.username } });
}
