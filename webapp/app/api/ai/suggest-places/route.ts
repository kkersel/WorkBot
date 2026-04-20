import { authed, bad, json } from "@/lib/http";
import { geminiAvailable, geminiJSON } from "@/lib/gemini";
import { z } from "zod";

const body = z.object({
  kind: z.string().min(1).max(40),
  hint: z.string().max(400).optional().nullable(),
  city: z.string().max(60).optional().nullable(),
  count: z.number().int().min(1).max(5).optional(),
});

const SYSTEM = `Ты — шокобургер, ассистент компании друзей. Помогаешь выбрать место
для встречи. Тон: неформальный, дружеский, короткие фразы, русский язык.

Отвечай ТОЛЬКО валидным JSON в формате:
{
  "places": [
    {
      "name": "название заведения",
      "address": "улица, дом, метро",
      "why": "1-2 коротких фразы почему именно сюда",
      "price_range": "примерный чек, напр. '1500-2500 ₽/чел'",
      "url": "2gis / yandex / сайт",
      "phone": "+7...",
      "emoji": "🍺"
    }
  ]
}

Давай 2-3 РАЗНЫЕ проверенные места под запрос. Попсу знаешь — предлагай её,
а не секретные подвалы. Если поля нет — ставь null, но name+address обязательны.`;

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
      temperature: 0.7,
      maxTokens: 900,
      useSearch: true,
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return bad((e as Error).message, 502);
  }
}
