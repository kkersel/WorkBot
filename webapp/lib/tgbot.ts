import "server-only";

const BASE = "https://api.telegram.org/bot";

type SendMessageInit = {
  chat_id: number | string;
  text: string;
  parse_mode?: "HTML" | "MarkdownV2";
  reply_markup?: unknown;
  disable_web_page_preview?: boolean;
};

export async function tgSendMessage(init: SendMessageInit): Promise<{ message_id: number; chat: { id: number } }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const r = await fetch(`${BASE}${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(init),
  });
  const data = (await r.json()) as { ok: boolean; description?: string; result?: { message_id: number; chat: { id: number } } };
  if (!data.ok) throw new Error(`telegram: ${data.description ?? r.status}`);
  return data.result!;
}
