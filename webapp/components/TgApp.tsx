"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AuthState =
  | { status: "loading" }
  | { status: "ready"; user: { id: number; first_name: string; username?: string | null } }
  | { status: "error"; message: string };

type Ctx = {
  auth: AuthState;
  tg: TelegramWebApp | null;
  colorScheme: "light" | "dark";
  hapticTap: () => void;
  haptic: (kind: "success" | "error" | "warning") => void;
  refresh: () => Promise<void>;
};

const TgCtx = createContext<Ctx | null>(null);

export function useTg(): Ctx {
  const c = useContext(TgCtx);
  if (!c) throw new Error("useTg must be used within <TgApp>");
  return c;
}

export function TgApp({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [tg, setTg] = useState<TelegramWebApp | null>(null);
  const [colorScheme, setColorScheme] = useState<"light" | "dark">("light");

  const applyTheme = useCallback((w: TelegramWebApp) => {
    setColorScheme(w.colorScheme);
    const html = document.documentElement;
    html.classList.toggle("tg-dark", w.colorScheme === "dark");

    const t = w.themeParams;
    const css = document.documentElement.style;
    if (t.bg_color) css.setProperty("--tg-bg", t.bg_color);
    if (t.text_color) css.setProperty("--tg-fg", t.text_color);
    if (t.hint_color) css.setProperty("--tg-hint", t.hint_color);
    if (t.link_color) css.setProperty("--tg-link", t.link_color);
    if (t.button_color) css.setProperty("--tg-btn", t.button_color);
    if (t.button_text_color) css.setProperty("--tg-btn-fg", t.button_text_color);
    if (t.secondary_bg_color) css.setProperty("--tg-secbg", t.secondary_bg_color);
  }, []);

  const doAuth = useCallback(async (initData: string) => {
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData }),
        credentials: "include",
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        setAuth({ status: "error", message: err.error ?? `auth failed (${r.status})` });
        return;
      }
      const data = (await r.json()) as {
        user: { id: number; first_name: string; username?: string | null };
      };
      setAuth({ status: "ready", user: data.user });
    } catch (e) {
      setAuth({ status: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    // Access Telegram.WebApp — loaded via beforeInteractive script in layout.
    const w = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
    if (!w) {
      // Not running inside Telegram — dev fallback.
      setAuth({
        status: "error",
        message: "open this app from Telegram",
      });
      return;
    }
    setTg(w);
    try {
      w.ready();
      w.expand();
      w.setHeaderColor("bg_color");
      w.setBackgroundColor("bg_color");
    } catch {
      /* older clients */
    }
    applyTheme(w);
    const onTheme = () => applyTheme(w);
    w.onEvent("themeChanged", onTheme);

    if (!w.initData) {
      setAuth({ status: "error", message: "no initData from Telegram" });
      return;
    }
    void doAuth(w.initData);

    return () => {
      try {
        w.offEvent("themeChanged", onTheme);
      } catch {
        /* noop */
      }
    };
  }, [applyTheme, doAuth]);

  const refresh = useCallback(async () => {
    if (tg?.initData) {
      setAuth({ status: "loading" });
      await doAuth(tg.initData);
    }
  }, [tg, doAuth]);

  const value = useMemo<Ctx>(
    () => ({
      auth,
      tg,
      colorScheme,
      hapticTap: () => {
        try {
          tg?.HapticFeedback.selectionChanged();
        } catch {
          /* noop */
        }
      },
      haptic: (kind) => {
        try {
          tg?.HapticFeedback.notificationOccurred(kind);
        } catch {
          /* noop */
        }
      },
      refresh,
    }),
    [auth, tg, colorScheme, refresh],
  );

  return <TgCtx.Provider value={value}>{children}</TgCtx.Provider>;
}
