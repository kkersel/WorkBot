import { authed, bad, json } from "@/lib/http";
import { tgSendMessage } from "@/lib/tgbot";
import { todayMSK } from "@/lib/schedule";
import { z } from "zod";

const body = z.object({ user_id: z.number().int() });

export async function POST(req: Request): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return bad("invalid json");
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "bad body");

  // запрещаем пинговать себя
  if (parsed.data.user_id === a.uid) return bad("cannot ping yourself");

  const date = todayMSK();

  try {
    await tgSendMessage({
      chat_id: parsed.data.user_id,
      text:
        `💪 <b>${a.name}</b> спрашивает — идёшь сегодня в зал?`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ иду", callback_data: `gym:yes:${date}` },
          { text: "❌ слив", callback_data: `gym:no:${date}` },
        ]],
      },
    });
    return json({ ok: true });
  } catch (e) {
    return bad((e as Error).message, 502);
  }
}
