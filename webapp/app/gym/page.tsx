"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { Button } from "@/components/ui/Button";
import { PageTransition } from "@/components/ui/PageTransition";
import { Skeleton } from "@/components/ui/Skeleton";
import { SmartAvatar } from "@/components/ui/SmartAvatar";
import { api } from "@/lib/api";
import { RU_MONTHS_GEN, RU_WEEKDAYS_SHORT } from "@/lib/format";

type Attendance = "yes" | "no" | "pending";

type TodayResponse = {
  is_gym_day: boolean;
  date: string;
  weekday: number;
  theme: string | null;
  people: Array<{
    user_id: number;
    name: string;
    photo_url: string | null;
    attendance: Attendance;
    label: string | null;
    optional: boolean;
  }>;
};

type UpcomingDay = {
  date: string;
  weekday: number;
  theme: string | null;
  people: TodayResponse["people"];
};

export default function GymPage() {
  const { auth, haptic, hapticTap } = useTg();
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingDay[] | null>(null);
  const [pingedIds, setPingedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    try {
      const r = await api.get<TodayResponse>("/api/gym/today");
      setToday(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadUpcoming = useCallback(async () => {
    try {
      const r = await api.get<{ days: UpcomingDay[] }>("/api/gym/upcoming?days=21");
      setUpcoming(r.days);
    } catch {
      setUpcoming([]);
    }
  }, []);

  useEffect(() => {
    if (auth.status !== "ready") return;
    loadToday();
    loadUpcoming();
  }, [auth.status, loadToday, loadUpcoming]);

  async function ping(userId: number) {
    try {
      await api.post("/api/gym/ping", { user_id: userId });
      setPingedIds((s) => new Set(s).add(userId));
      haptic("success");
      setTimeout(() => {
        setPingedIds((s) => {
          const next = new Set(s);
          next.delete(userId);
          return next;
        });
      }, 2200);
    } catch (e) {
      haptic("error");
      setError((e as Error).message);
    }
  }

  const myId = auth.status === "ready" ? auth.user.id : null;

  const settingsButton = (
    <Link
      href="/gym/settings"
      onClick={() => hapticTap()}
      className="w-9 h-9 rounded-full bg-[var(--tg-secbg)] flex items-center justify-center"
      aria-label="настройки"
    >
      <span className="text-lg leading-none">⚙️</span>
    </Link>
  );

  return (
    <Shell title="зал" right={settingsButton}>
      <PageTransition>
        <div className="p-4 space-y-5 pb-6">
          {today === null ? (
            <Skeleton className="h-36" />
          ) : today.is_gym_day ? (
            <TodayBlock
              today={today}
              myId={myId}
              pingedIds={pingedIds}
              onPing={ping}
            />
          ) : (
            <div className="rounded-2xl bg-[var(--tg-secbg)] p-4 text-center text-hint text-sm">
              сегодня не день зала — отдыхаем 😌
            </div>
          )}

          {upcoming === null ? (
            <Skeleton className="h-32" />
          ) : upcoming.length > 0 ? (
            <UpcomingStrip days={upcoming} today={today?.date ?? null} />
          ) : (
            <div className="rounded-2xl bg-[var(--tg-secbg)] p-4 text-center text-hint text-sm">
              в ближайшие 3 недели нет дней зала.{" "}
              <Link href="/gym/settings" className="text-link">
                настроить →
              </Link>
            </div>
          )}

          {error && <div className="text-red-500 text-sm">{error}</div>}
        </div>
      </PageTransition>
    </Shell>
  );
}

function TodayBlock({
  today,
  myId,
  pingedIds,
  onPing,
}: {
  today: TodayResponse;
  myId: number | null;
  pingedIds: Set<number>;
  onPing: (userId: number) => void;
}) {
  const yes = today.people.filter((p) => p.attendance === "yes");
  const no = today.people.filter((p) => p.attendance === "no");
  const pending = today.people.filter((p) => p.attendance === "pending");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-[var(--tg-secbg)] p-4 space-y-4"
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-hint">сегодня</div>
          <div className="text-lg font-semibold">
            💪 день зала{today.theme ? ` · ${today.theme}` : ""}
          </div>
        </div>
        <div className="text-right text-xs text-hint">
          {today.people.length} человек
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <StatBox color="bg-green-500/15 text-green-500" label="идут" count={yes.length} />
        <StatBox color="bg-red-500/15 text-red-500" label="сливают" count={no.length} />
        <StatBox color="bg-yellow-500/15 text-yellow-500" label="молчат" count={pending.length} />
      </div>

      <div className="space-y-3">
        <Group icon="✅" title="идут" people={yes} myId={myId} />
        <Group icon="❌" title="сливают" people={no} myId={myId} />
        <Group
          icon="🕐"
          title="не ответили"
          people={pending}
          myId={myId}
          actions={(p) =>
            p.user_id !== myId ? (
              <Button
                size="sm"
                variant={pingedIds.has(p.user_id) ? "secondary" : "ghost"}
                onClick={() => onPing(p.user_id)}
                disabled={pingedIds.has(p.user_id)}
              >
                {pingedIds.has(p.user_id) ? "пинганул ✓" : "пингануть"}
              </Button>
            ) : null
          }
        />
      </div>
    </motion.div>
  );
}

function StatBox({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <motion.div layout className={`rounded-xl ${color} py-2`}>
      <motion.div
        key={count}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="text-xl font-bold"
      >
        {count}
      </motion.div>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
    </motion.div>
  );
}

function Group({
  icon,
  title,
  people,
  myId,
  actions,
}: {
  icon: string;
  title: string;
  people: TodayResponse["people"];
  myId: number | null;
  actions?: (p: TodayResponse["people"][number]) => React.ReactNode;
}) {
  if (people.length === 0) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-hint mb-1.5">
        {icon} {title}
      </div>
      <div className="space-y-1">
        {people.map((p, i) => (
          <motion.div
            key={p.user_id}
            layout
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center gap-3 bg-[var(--tg-bg)] rounded-lg px-3 py-2"
          >
            <SmartAvatar userId={p.user_id} name={p.name} src={p.photo_url} size={28} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {p.name}
                {p.user_id === myId && <span className="text-hint text-xs ml-1">— ты</span>}
              </div>
              {p.label && <div className="text-[11px] text-hint">{p.label}</div>}
            </div>
            {actions?.(p)}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function UpcomingStrip({ days, today }: { days: UpcomingDay[]; today: string | null }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="text-xs uppercase tracking-wider text-hint">календарь зала</div>
        <div className="text-[10px] text-hint">{days.length} дн.</div>
      </div>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {days.map((d, i) => (
          <UpcomingCard key={d.date} day={d} isToday={d.date === today} index={i} />
        ))}
      </div>
    </section>
  );
}

function UpcomingCard({
  day,
  isToday,
  index,
}: {
  day: UpcomingDay;
  isToday: boolean;
  index: number;
}) {
  const yes = day.people.filter((p) => p.attendance === "yes");
  const no = day.people.filter((p) => p.attendance === "no");
  const pending = day.people.filter((p) => p.attendance === "pending");
  const [, m, d] = day.date.split("-").map(Number);
  const wd = RU_WEEKDAYS_SHORT[day.weekday];
  const monthShort = RU_MONTHS_GEN[m - 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 400, damping: 28 }}
      className={`shrink-0 w-40 rounded-2xl p-3 space-y-2 ring-1 ${
        isToday
          ? "bg-btn/10 ring-[var(--tg-link)]"
          : "bg-[var(--tg-secbg)] ring-transparent"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-hint">{wd}</div>
          <div className="text-sm font-semibold">
            {d} {monthShort}
          </div>
        </div>
        {isToday && (
          <div className="text-[10px] font-semibold text-link uppercase">сегодня</div>
        )}
      </div>
      {day.theme && <div className="text-[11px] text-hint truncate">💪 {day.theme}</div>}
      <div className="flex items-center gap-1 min-h-[22px]">
        <AvatarStackMini people={yes} />
        {yes.length > 0 && <span className="text-[10px] text-green-500">✓{yes.length}</span>}
      </div>
      <div className="flex flex-wrap gap-1 text-[9px]">
        {yes.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-500">
            идут {yes.length}
          </span>
        )}
        {no.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500">
            сливают {no.length}
          </span>
        )}
        {pending.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500">
            ? {pending.length}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function AvatarStackMini({
  people,
}: {
  people: Array<{ user_id: number; name: string; photo_url: string | null }>;
}) {
  if (people.length === 0) {
    return <div className="text-[10px] text-hint">ещё никто</div>;
  }
  const visible = people.slice(0, 4);
  const extra = people.length - visible.length;
  return (
    <div className="flex -space-x-1.5">
      {visible.map((p) => (
        <SmartAvatar
          key={p.user_id}
          userId={p.user_id}
          name={p.name}
          src={p.photo_url}
          size={20}
          ringClass="ring-2 ring-[var(--tg-bg)]"
        />
      ))}
      {extra > 0 && (
        <div className="w-5 h-5 rounded-full bg-[var(--tg-bg)] flex items-center justify-center text-[9px] font-bold">
          +{extra}
        </div>
      )}
    </div>
  );
}
