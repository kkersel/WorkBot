"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { PageTransition } from "@/components/ui/PageTransition";
import { Skeleton } from "@/components/ui/Skeleton";
import { SmartAvatar } from "@/components/ui/SmartAvatar";
import { api } from "@/lib/api";
import {
  fmtDayLong,
  fmtDdMmYyyy,
  RU_WEEKDAYS_SHORT,
} from "@/lib/format";
import {
  daysFromWeeklyMask,
  todayMSK,
  type DayStatus,
  type UserSchedule,
} from "@/lib/schedule";

type MeResponse = {
  user: { id: number; first_name: string; username: string | null } | null;
  schedule: (UserSchedule & { label: string | null }) | null;
};

type StatusResponse = {
  date: string;
  views: {
    user_id: number;
    name: string;
    username: string | null;
    photo_url: string | null;
    label: string | null;
    status: DayStatus;
  }[];
  next_common_off: string | null;
};

const MY_STATUS_LABEL: Record<DayStatus, { text: string; tone: string; emoji: string }> = {
  work: { text: "сегодня рабочий", tone: "text-red-500", emoji: "🏃" },
  rest: { text: "сегодня выходной", tone: "text-green-500", emoji: "😎" },
  vacation: { text: "в отпуске", tone: "text-yellow-500", emoji: "🏖" },
  holiday: { text: "праздник 🎉", tone: "text-purple-500", emoji: "🎉" },
  unemployed: { text: "безработный", tone: "text-hint", emoji: "😎" },
};

function describeSchedule(s: UserSchedule & { label: string | null }): string {
  if (s.type === "cycle" && s.start_date && s.work_days != null && s.rest_days != null) {
    return `${s.work_days}/${s.rest_days} · с ${fmtDdMmYyyy(s.start_date)}`;
  }
  if (s.type === "weekly" && s.weekly_mask != null) {
    const days = daysFromWeeklyMask(s.weekly_mask).map((d) => RU_WEEKDAYS_SHORT[d]);
    return days.length ? days.join(" · ") : "—";
  }
  if (s.type === "unemployed") return "безработный 😎";
  return "ручной график";
}

export default function HomePage() {
  const { auth } = useTg();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);

  const today = todayMSK();

  useEffect(() => {
    if (auth.status !== "ready") return;
    api.get<MeResponse>("/api/me").then(setMe).catch(() => {});
    api.get<StatusResponse>(`/api/status?date=${today}`).then(setStatus).catch(() => {});
  }, [auth.status, today]);

  const myView = status && auth.status === "ready"
    ? status.views.find((v) => v.user_id === auth.user.id)
    : null;
  const myStatusKey: DayStatus | null = myView ? myView.status : null;

  return (
    <Shell>
      <PageTransition>
        <div className="p-4 space-y-4 pb-6">
          {/* Hero */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-hint text-sm"
            >
              {fmtDayLong(today)}
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="text-2xl font-semibold mt-0.5"
            >
              {auth.status === "ready" ? `хой, ${auth.user.first_name} 🍔` : "хой 🍔"}
            </motion.h1>
            {myStatusKey && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 }}
                className={`text-sm mt-0.5 font-medium ${MY_STATUS_LABEL[myStatusKey].tone}`}
              >
                {MY_STATUS_LABEL[myStatusKey].emoji} {MY_STATUS_LABEL[myStatusKey].text}
              </motion.div>
            )}
          </div>

          {/* My schedule card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="rounded-2xl bg-[var(--tg-secbg)] p-4"
          >
            <div className="text-xs uppercase tracking-wider text-hint">мой график</div>
            <div className="mt-1 text-lg font-semibold">
              {me === null ? (
                <Skeleton className="h-6 w-32" />
              ) : me.schedule ? (
                describeSchedule(me.schedule)
              ) : (
                "ещё не настроен"
              )}
            </div>
            {me?.schedule && (
              <div className="text-hint text-xs mt-1">
                праздники {me.schedule.respect_holidays ? "учитываются" : "игнорируются"}
              </div>
            )}
            <Link
              href="/schedule"
              className="inline-block mt-3 text-sm text-link font-medium"
            >
              {me?.schedule ? "поменять →" : "настроить →"}
            </Link>
          </motion.div>

          {/* Today team strip */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26 }}
            className="rounded-2xl bg-[var(--tg-secbg)] p-4"
          >
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-xs uppercase tracking-wider text-hint">
                сегодня в команде
              </div>
              <Link href="/calendar" className="text-xs text-link">
                все →
              </Link>
            </div>
            {status === null ? (
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="w-10 h-10 rounded-full" />
                ))}
              </div>
            ) : (
              <TeamStrip views={status.views} />
            )}
            {status?.next_common_off && status.next_common_off !== today && (
              <div className="text-xs text-hint mt-3">
                🚬 ближайший общий выходной:{" "}
                <span className="text-[var(--tg-fg)] font-medium">
                  {fmtDdMmYyyy(status.next_common_off)}
                </span>
              </div>
            )}
          </motion.div>

          {/* Quick tiles */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: "/calendar", icon: "🗓", label: "команда", sub: "месяц, все сразу" },
              { href: "/invite", icon: "✨", label: "позвать", sub: "AI подберёт место" },
              { href: "/vacations", icon: "🏖", label: "отпуска", sub: "добавить / убрать" },
              { href: "/gym", icon: "💪", label: "зал", sub: "напоминания" },
            ].map((t, i) => (
              <motion.div
                key={t.href}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32 + i * 0.05 }}
              >
                <Tile {...t} />
              </motion.div>
            ))}
          </div>
        </div>
      </PageTransition>
    </Shell>
  );
}

function TeamStrip({
  views,
}: {
  views: {
    user_id: number;
    name: string;
    photo_url: string | null;
    status: DayStatus;
  }[];
}) {
  if (views.length === 0) {
    return <div className="text-hint text-sm">пока никого — закинь /start в группу</div>;
  }
  const order: DayStatus[] = ["work", "rest", "vacation", "holiday", "unemployed"];
  const sorted = [...views].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
  );
  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-1">
      {sorted.map((v, i) => (
        <motion.div
          key={v.user_id}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 22 }}
          className="flex flex-col items-center gap-1 min-w-[52px]"
        >
          <AvatarWithStatus
            id={v.user_id}
            name={v.name}
            src={v.photo_url}
            status={v.status}
          />
          <div className="text-[10px] text-hint truncate max-w-[52px]">{v.name}</div>
        </motion.div>
      ))}
    </div>
  );
}

function AvatarWithStatus({
  id,
  name,
  src,
  status,
}: {
  id: number;
  name: string;
  src: string | null;
  status: DayStatus;
}) {
  const ring = {
    work: "ring-red-500",
    rest: "ring-green-500",
    vacation: "ring-yellow-400",
    holiday: "ring-purple-500",
    unemployed: "ring-[var(--tg-bg)]",
  }[status];
  const dim = status === "work" || status === "holiday" ? "" : "opacity-70";
  return (
    <div className={`relative ${dim}`}>
      <SmartAvatar userId={id} name={name} src={src} size={40} ringClass={`ring-2 ${ring}`} />
    </div>
  );
}

function Tile({
  href,
  icon,
  label,
  sub,
}: {
  href: string;
  icon: string;
  label: string;
  sub: string;
}) {
  return (
    <Link href={href}>
      <motion.div
        whileTap={{ scale: 0.96 }}
        className="rounded-2xl bg-[var(--tg-secbg)] p-4 flex flex-col gap-1"
      >
        <div className="text-2xl">{icon}</div>
        <div className="font-medium">{label}</div>
        <div className="text-hint text-xs">{sub}</div>
      </motion.div>
    </Link>
  );
}
