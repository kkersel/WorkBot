"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { useTg } from "./TgApp";

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "главная", icon: "🏠" },
  { href: "/status", label: "кто сегодня", icon: "👀" },
  { href: "/schedule", label: "мой график", icon: "📅" },
  { href: "/calendar", label: "календарь", icon: "🗓" },
  { href: "/vacations", label: "отпуска", icon: "🏖" },
  { href: "/gym", label: "зал", icon: "💪" },
];

export function Shell({
  title,
  children,
  hideNav,
}: {
  title?: string;
  children: ReactNode;
  hideNav?: boolean;
}) {
  const { auth } = useTg();
  const pathname = usePathname();

  if (auth.status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center text-hint">
        загружаю…
      </div>
    );
  }
  if (auth.status === "error") {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-2xl mb-2">🍔</div>
          <div className="font-semibold">шокобургер не может открыться</div>
          <div className="text-hint text-sm mt-2">{auth.message}</div>
          <div className="text-hint text-xs mt-4">открой через бота в Telegram</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {title && (
        <header className="px-4 py-3 border-b border-[var(--tg-secbg)]">
          <h1 className="text-lg font-semibold">{title}</h1>
        </header>
      )}
      <main className="flex-1 overflow-y-auto">{children}</main>
      {!hideNav && (
        <nav className="safe-bottom grid grid-cols-6 border-t border-[var(--tg-secbg)] bg-[var(--tg-bg)]">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex flex-col items-center py-2 text-[10px] gap-0.5 ${
                  active ? "text-link" : "text-hint"
                }`}
              >
                <span className="text-lg">{n.icon}</span>
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
