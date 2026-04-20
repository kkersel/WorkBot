"use client";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `${r.status} ${r.statusText}`);
  }
  return (await r.json()) as T;
}

export const api = {
  get: <T,>(url: string) => req<T>(url),
  post: <T,>(url: string, body: unknown) =>
    req<T>(url, { method: "POST", body: JSON.stringify(body) }),
  put: <T,>(url: string, body: unknown) =>
    req<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  del: <T,>(url: string) => req<T>(url, { method: "DELETE" }),
};
