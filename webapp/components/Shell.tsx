"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useTg } from "./TgApp";
import { Skeleton } from "./ui/Skeleton";

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "главная", icon: "🏠" },
  { href: "/calendar", label: "команда", icon: "🗓" },
  { href: "/schedule", label: "график", icon: "📅" },
  { href: "/invite", label: "позвать", icon: "✨" },
  { href: "/vacations", label: "отпуска", icon: "🏖" },
];

export function Shell({
  title,
  children,
  hideNav,
  back,
}: {
  title?: string;
  children: ReactNode;
  hideNav?: boolean;
  back?: boolean;
}) {
  const { auth, tg, hapticTap } = useTg();
  const pathname = usePathname();
  const router = useRouter();

  // Wire Telegram BackButton to browser back.
  useEffect(() => {
    if (!tg) return;
    const shouldShow = !!back || pathname !== "/";
    const handler = () => router.back();
    try {
      if (shouldShow) {
        tg.BackButton.onClick(handler);
        tg.BackButton.show();
      } else {
        tg.BackButton.hide();
      }
    } catch {
      /* older clients */
    }
    return () => {
      try {
        tg.BackButton.offClick(handler);
      } catch {
        /* noop */
      }
    };
  }, [tg, pathname, back, router]);

  if (auth.status === "loading") return <LoadingScreen />;
  if (auth.status === "error") return <ErrorScreen message={auth.message} />;

  return (
    <div className="flex-1 flex flex-col">
      {title && (
        <header className="px-4 py-3 border-b border-[var(--tg-secbg)]">
          <motion.h1
            key={title}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-lg font-semibold"
          >
            {title}
          </motion.h1>
        </header>
      )}
      <main className="flex-1 overflow-y-auto">{children}</main>
      {!hideNav && (
        <nav className="safe-bottom grid grid-cols-5 border-t border-[var(--tg-secbg)] bg-[var(--tg-bg)]">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => hapticTap()}
                className="relative flex flex-col items-center py-2 text-[10px] gap-0.5"
              >
                <motion.span
                  animate={active ? { scale: 1.15, y: -1 } : { scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className="text-lg"
                >
                  {n.icon}
                </motion.span>
                <span
                  className={`transition-colors ${
                    active ? "text-link font-medium" : "text-hint"
                  }`}
                >
                  {n.label}
                </span>
                {active && (
                  <motion.span
                    layoutId="nav-dot"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--tg-link)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <motion.div
        animate={{ scale: [1, 1.08, 1], rotate: [0, 6, -6, 0] }}
        transition={{ duration: 1.2, repeat: Infinity }}
        className="text-5xl"
      >
        🍔
      </motion.div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 text-center">
      <div>
        <div className="text-4xl mb-2">🍔</div>
        <div className="font-semibold">шокобургер не может открыться</div>
        <div className="text-hint text-sm mt-2">{message}</div>
        <div className="text-hint text-xs mt-4">открой через бота в Telegram</div>
      </div>
    </div>
  );
}
