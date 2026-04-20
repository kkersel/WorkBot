import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "wb_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

type Payload = {
  uid: number;
  name: string;
  iat: number;
};

function sign(data: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function secret(): string {
  const s = process.env.TELEGRAM_BOT_TOKEN;
  if (!s) throw new Error("TELEGRAM_BOT_TOKEN is not set (used for session signing)");
  return s;
}

export function packSession(uid: number, name: string): string {
  const payload: Payload = { uid, name, iat: Math.floor(Date.now() / 1000) };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(body, secret());
  return `${body}.${sig}`;
}

export function readSession(token: string | undefined): Payload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, secret());
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    const age = Math.floor(Date.now() / 1000) - p.iat;
    if (age > MAX_AGE_SEC) return null;
    return p;
  } catch {
    return null;
  }
}

export async function setSessionCookie(uid: number, name: string): Promise<void> {
  const c = await cookies();
  c.set(COOKIE, packSession(uid, name), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function getSession(): Promise<Payload | null> {
  const c = await cookies();
  return readSession(c.get(COOKIE)?.value);
}

export async function requireSession(): Promise<Payload> {
  const s = await getSession();
  if (!s) throw new Response("unauthorized", { status: 401 });
  return s;
}
