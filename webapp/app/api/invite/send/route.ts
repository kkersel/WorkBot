import { sql } from "@/lib/db";
import { authed, bad, json } from "@/lib/http";
import { tgSendMessage } from "@/lib/tgbot";
import { z } from "zod";

const place = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(240).nullable().optional(),
  why: z.string().max(500).nullable().optional(),
  price_range: z.string().max(120).nullable().optional(),
  url: z.string().max(400).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  emoji: z.string().max(8).nullable().optional(),
});

const body = z.object({
  kind: z.string().min(1).max(40),
  inviter_name: z.string().min(1).max(60),
  place: place,
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildCard(inviter: string, kind: string, p: z.infer<typeof place>): string {
  const emoji = p.emoji || "🎉";
  const lines = [
    `${emoji} <b>${escapeHtml(inviter)}</b> зовёт на <b>${escapeHtml(kind)}</b>!`,
    "",
    `📍 <b>${escapeHtml(p.name)}</b>`,
  ];
  if (p.address) lines.push(`   ${escapeHtml(p.address)}`);
  if (p.price_range) lines.push(`💰 ${escapeHtml(p.price_range)}`);
  if (p.why) {
    lines.push("");
    lines.push(`<i>${escapeHtml(p.why)}</i>`);
  }
  if (p.phone) {
    lines.push("");
    lines.push(`☎️ <code>${escapeHtml(p.phone)}</code>`);
  }
  if (p.url) lines.push(`🔗 <a href="${encodeURI(p.url)}">подробнее</a>`);
  lines.push("");
  lines.push("кто идёт?");
  return lines.join("\n");
}

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
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "invalid body");

  // Target chat: primary group from env. Fallback to user's own DM.
  const envChat = process.env.PRIMARY_CHAT_ID;
  const chatId = envChat && envChat !== "0" ? Number(envChat) : a.uid;

  // Insert invite row so inline button callbacks can update it later.
  const p = parsed.data.place;
  const rows = await sql<{ id: number }[]>/* sql */ `
    INSERT INTO invites
      (chat_id, created_by, kind, prompt,
       place_name, place_address, place_url, place_phone, price_range, ai_raw)
    VALUES (${chatId}, ${a.uid}, ${parsed.data.kind}, NULL,
            ${p.name}, ${p.address ?? null}, ${p.url ?? null},
            ${p.phone ?? null}, ${p.price_range ?? null}, ${sql.json(p)})
    RETURNING id
  `;
  const inviteId = Number(rows[0].id);

  const text = buildCard(parsed.data.inviter_name, parsed.data.kind, p);
  const res = await tgSendMessage({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ иду", callback_data: `inv:yes:${inviteId}` },
        { text: "🤔 мб",  callback_data: `inv:maybe:${inviteId}` },
        { text: "❌ нет", callback_data: `inv:no:${inviteId}` },
      ]],
    },
  });

  await sql/* sql */ `
    UPDATE invites SET message_id = ${res.message_id} WHERE id = ${inviteId}
  `;

  return json({ ok: true, invite_id: inviteId, message_id: res.message_id, chat_id: chatId });
}
