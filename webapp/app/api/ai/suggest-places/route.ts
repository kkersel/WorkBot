import { authed, bad, json } from "@/lib/http";
import { geminiAvailable, geminiJSON } from "@/lib/gemini";
import { z } from "zod";

const body = z.object({
  prompt: z.string().min(1).max(600),
  city: z.string().max(60).optional().nullable(),
});

const SYSTEM = `Ты — подсказчик мест в Москве для компании друзей до 8 человек.
Работаешь как JSON-API: никаких приветствий, извинений, объяснений — только
JSON-объект.

ВХОД: произвольный текстовый запрос на русском. Может быть:
— один тип места («бар с террасой»)
— план с несколькими остановками («сначала боулинг потом пул и бар»)
— пожелание по атмосфере / бюджету

СТРОГИЙ формат ответа:
{
  "reply": "1-2 фразы что предлагаешь, неформально, как другу. null если нечего добавить.",
  "places": [
    {
      "name": "название заведения",
      "address": "улица, дом, метро",
      "kind": "короткая категория: бар/пул/боулинг/...",
      "why": "1-2 фразы почему сюда, неформально",
      "price_range": "примерный чек, напр. '1500-2500 ₽/чел', или null",
      "url": "ссылка (2gis / yandex / сайт) или null",
      "phone": "+7... или null",
      "emoji": "один подходящий эмодзи",
      "step": 1
    }
  ]
}

Правила:
— Если в запросе ПЛАН из нескольких остановок — верни их в порядке прохождения,
  step=1,2,3…
— Если запрос про одно место — верни 2-3 РАЗНЫЕ проверенные альтернативы,
  step=null у всех.
— Попса, популярные места — норм. Не секретные подвалы.
— name+address обязательны. url/phone лучше null чем выдумывать.
— Ответ начинай с { и заканчивай } — ничего лишнего.`;

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
  const user = `Город: ${city}.\nЗапрос: ${parsed.data.prompt.trim()}`;

  try {
    const result = await geminiJSON<Record<string, unknown>>({
      system: SYSTEM,
      user,
      temperature: 0.5,
      maxTokens: 1200,
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return bad((e as Error).message, 502);
  }
}
