import "server-only";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}";

const DEFAULT_MODEL = "gemini-2.5-flash";

export function geminiAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

type GenOpts = {
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  useSearch?: boolean;
};

export async function geminiGen(opts: GenOpts): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const body: Record<string, unknown> = {
    systemInstruction: { role: "system", parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 1024,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
    ...(opts.useSearch ? { tools: [{ google_search: {} }] } : {}),
  };

  const url = GEMINI_URL.replace("{model}", opts.model ?? DEFAULT_MODEL).replace(
    "{key}",
    key,
  );
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // Vercel functions have 30s default; leave room
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`gemini ${r.status}: ${text.slice(0, 300)}`);
  }
  const data = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

export async function geminiJSON<T>(opts: GenOpts): Promise<T> {
  const raw = await geminiGen({ ...opts, json: true });
  return JSON.parse(raw) as T;
}
