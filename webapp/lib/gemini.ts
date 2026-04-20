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

  // Gemini doesn't allow tools + responseMimeType=application/json together.
  // If caller wants both, fall back to text mode and rely on system-prompt
  // JSON discipline (geminiJSON will strip code fences).
  const canForceJson = opts.json && !opts.useSearch;

  const body: Record<string, unknown> = {
    systemInstruction: { role: "system", parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 1024,
      ...(canForceJson ? { responseMimeType: "application/json" } : {}),
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
  const candidate = extractJson(raw);
  try {
    return JSON.parse(candidate) as T;
  } catch (err) {
    // Try to repair common model mistakes before giving up.
    const repaired = repairJson(candidate);
    try {
      return JSON.parse(repaired) as T;
    } catch {
      // Surface the original error with a bit of the payload for debugging.
      const snippet = candidate.slice(0, 200).replace(/\s+/g, " ");
      throw new Error(`${(err as Error).message} — near: ${snippet}`);
    }
  }
}

function repairJson(s: string): string {
  let out = s;
  // Smart quotes → regular
  out = out.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  // Trailing commas before } or ]
  out = out.replace(/,\s*([}\]])/g, "$1");
  // Double trailing commas like `,,` → single
  out = out.replace(/,\s*,/g, ",");
  // Unclosed final object/array — add closers greedily (best-effort)
  const opens = (out.match(/[{[]/g) ?? []).length;
  const closes = (out.match(/[}\]]/g) ?? []).length;
  if (opens > closes) {
    // Close with the opposite brace of whatever was most recently opened;
    // simplest safe heuristic: prefer } then ].
    const deficit = opens - closes;
    out += "}".repeat(Math.min(deficit, 3));
  }
  return out;
}

/**
 * Pull a JSON object out of a model response that may include stray prose,
 * ```json fences, trailing markdown, etc. Returns the first balanced {...}
 * or [...] substring, or the trimmed raw if no braces found.
 */
function extractJson(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  // strip ```json ... ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1]?.trim() ?? s;

  // find first {...} or [...] by brace-matching
  const openIdx = body.search(/[{[]/);
  if (openIdx < 0) return body;
  const open = body[openIdx];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < body.length; i++) {
    const ch = body[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return body.slice(openIdx, i + 1);
    }
  }
  return body.slice(openIdx); // unbalanced — let JSON.parse complain
}
