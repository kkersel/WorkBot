import { authed, bad, json } from "@/lib/http";
import { geminiAvailable, geminiJSON } from "@/lib/gemini";
import { z } from "zod";

const body = z.object({
  kind: z.string().min(1).max(40),
  hint: z.string().max(400).optional().nullable(),
  city: z.string().max(60).optional().nullable(),
  count: z.number().int().min(1).max(5).optional(),
});

const SYSTEM = `Ты — подсказчик мест в Москве для компании друзей до 8 человек.
Работаешь ТОЛЬКО как JSON-API: никогда не пиши «Привет», не объясняй, не
извиняйся — только JSON-объект и больше ничего.

СТРОГИЙ формат (обязательно включи ключ "places"):
{
  "places": [
    {
      "name": "название",
      "address": "улица, дом, метро",
      "why": "1-2 коротких фразы почему сюда, неформально",
      "price_range": "примерный чек, напр. '1500-2500 ₽/чел' или null",
      "url": "ссылка (2gis / yandex / сайт) или null",
      "phone": "+7... или null",
      "emoji": "один эмодзи"
    }
  ]
}

Давай 2-3 РАЗНЫХ популярных проверенных места из запроса. Не подвалы-секретки.
Поля url и phone можно ставить null если не уверен. name+address обязательны.
Отвечай ИСКЛЮЧИТЕЛЬНО валидным JSON — начинай ответ с { и заканчивай }.`;

export async function POST(req: Request): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;
  if (!geminiAvailable()) return bad("AI not configured", 503);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return bad("invalid json");
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "invalid body");

  const city = parsed.data.city?.trim() || "Москва";
  const count = parsed.data.count ?? 3;
  const user = [
    `Куда пойти: ${parsed.data.kind}`,
    parsed.data.hint ? `Уточнения: ${parsed.data.hint}` : null,
    `Город: ${city}.`,
    `Количество людей: до 8.`,
    `Предложи ровно ${count} места.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await geminiJSON<Record<string, unknown>>({
      system: SYSTEM,
      user,
      temperature: 0.4,
      maxTokens: 900,
      useSearch: false, // см. комментарий: search + JSON-mode несовместимы у Gemini
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return bad((e as Error).message, 502);
  }
}
