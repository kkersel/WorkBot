import { authed, bad, json } from "@/lib/http";
import { geminiAvailable, geminiJSON } from "@/lib/gemini";
import { z } from "zod";

const body = z.object({
  text: z.string().min(1).max(500),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const SYSTEM = `Ты — парсер рабочего графика. Твоя задача: по описанию на русском
вернуть структурированный JSON одного из трёх типов:

1) Цикл N/M (N рабочих / M выходных):
   {"kind":"cycle","work_days":N,"rest_days":M,"start_date":"YYYY-MM-DD","respect_holidays":true}
   start_date — первый рабочий день цикла (используй today если человек не указал).

2) Недельный (конкретные дни недели, всегда одни и те же):
   {"kind":"weekly","weekdays":[0,1,2,3,4],"respect_holidays":true}
   0=Пн, 1=Вт, 2=Ср, 3=Чт, 4=Пт, 5=Сб, 6=Вс.

3) Не работаю / отпуск:
   {"kind":"unemployed"}

Примеры:
— «3 через 2» → {"kind":"cycle","work_days":3,"rest_days":2,"start_date":TODAY,"respect_holidays":true}
— «работаю пн-пт» → {"kind":"weekly","weekdays":[0,1,2,3,4],"respect_holidays":true}
— «вт, чт, сб» → {"kind":"weekly","weekdays":[1,3,5],"respect_holidays":true}
— «5 через 2» → {"kind":"cycle","work_days":5,"rest_days":2,"start_date":TODAY,"respect_holidays":true}
— «сутки через трое» → {"kind":"cycle","work_days":1,"rest_days":3,"start_date":TODAY,"respect_holidays":true}
— «не работаю / я фрилансер / лежу дома» → {"kind":"unemployed"}

Если не можешь распарсить — верни {"kind":"unknown","hint":"короткая подсказка что уточнить"}.
Отвечай ТОЛЬКО валидным JSON без комментариев.`;

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

  try {
    const result = await geminiJSON<Record<string, unknown>>({
      system: SYSTEM.replace(/TODAY/g, `"${parsed.data.today}"`),
      user: parsed.data.text,
      temperature: 0.2,
      maxTokens: 200,
    });
    return json({ ok: true, parsed: result });
  } catch (e) {
    return bad((e as Error).message, 502);
  }
}
