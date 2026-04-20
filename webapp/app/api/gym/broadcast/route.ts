import { sql } from "@/lib/db";
import { adminOnly, bad, json } from "@/lib/http";
import { tgSendMessage } from "@/lib/tgbot";
import { computeDay } from "@/lib/queries";
import { todayMSK, weekdayMonFirst } from "@/lib/schedule";

/**
 * Manual trigger of the group gym broadcast. Admin-only.
 * Sends the same mention-based message to PRIMARY_CHAT_ID that the
 * scheduled job would send at the configured hour.
 */
export async function POST(): Promise<Response> {
  const a = await adminOnly();
  if (!a.ok) return a.response;

  const chatId = process.env.PRIMARY_CHAT_ID;
  if (!chatId || chatId === "0") return bad("PRIMARY_CHAT_ID not set", 400);

  const date = todayMSK();
  const weekday = weekdayMonFirst(date);
  const wdKey = String(weekday);

  // gym-enabled users whose plan covers today
  const users = await sql<
    Array<{
      user_id: number;
      first_name: string;
      username: string | null;
      days: Record<string, { label?: string; optional?: boolean }>;
      evening_poll: boolean;
    }>
  >/* sql */ `
    SELECT g.user_id, u.first_name, u.username, g.days, g.evening_poll
    FROM gym_plan g
    JOIN users u ON u.id = g.user_id
    WHERE g.enabled = true AND g.days ? ${wdKey}
  `;
  if (users.length === 0) return bad("сегодня никому не день зала", 400);

  const views = await computeDay(date);
  const statusById: Record<number, string> = {};
  for (const v of views) statusById[v.user_id] = v.status;

  const eligible = users.filter((u) => {
    if (!u.evening_poll) return false;
    if (statusById[Number(u.user_id)] === "work") return false;
    return true;
  });
  if (eligible.length === 0) return bad("все либо работают, либо с выключенным опросом", 400);

  let theme: string | null = null;
  for (const u of eligible) {
    const lbl = u.days[wdKey]?.label;
    if (lbl) {
      theme = lbl;
      break;
    }
  }

  const mentions = eligible
    .map((u) => {
      const username = (u.username ?? "").trim();
      if (username) return `@${username}`;
      const esc = (u.first_name || "друг")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<a href="tg://user?id=${u.user_id}">${esc}</a>`;
    })
    .join(" ");

  const header = `💪 <b>день зала</b>${theme ? ` · <i>${theme}</i>` : ""}`;
  const text = `${header}\n${mentions}\n\nкто идёт?`;

  try {
    await tgSendMessage({
      chat_id: Number(chatId),
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ иду", callback_data: `gym:yes:${date}` },
          { text: "❌ слив", callback_data: `gym:no:${date}` },
        ]],
      },
    });
    return json({ ok: true, pinged: eligible.length });
  } catch (e) {
    return bad((e as Error).message, 502);
  }
}
