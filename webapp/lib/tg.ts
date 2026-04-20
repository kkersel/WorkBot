import "server-only";
import crypto from "node:crypto";

export type TgUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

/**
 * Validate Telegram WebApp initData per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Returns parsed user + auth_date on success; null on failure.
 * Rejects data older than `maxAgeSec` (default 24h).
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 60 * 60 * 24,
): { user: TgUser; authDate: number } | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .map(([k, v]) => [k, v] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // constant-time compare
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Number.isNaN(authDate)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAgeSec) return null;

  const userJson = params.get("user");
  if (!userJson) return null;
  try {
    const user = JSON.parse(userJson) as TgUser;
    if (typeof user.id !== "number" || !user.first_name) return null;
    return { user, authDate };
  } catch {
    return null;
  }
}
