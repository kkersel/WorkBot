"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { Button } from "@/components/ui/Button";
import { PageTransition } from "@/components/ui/PageTransition";
import { Skeleton } from "@/components/ui/Skeleton";
import { SmartAvatar } from "@/components/ui/SmartAvatar";
import { api } from "@/lib/api";
import { RU_MONTHS_NOM, RU_WEEKDAYS_SHORT } from "@/lib/format";
import { todayMSK, weekdayMonFirst, type DayStatus } from "@/lib/schedule";

type TeamUser = {
  id: number;
  name: string;
  photo_url: string | null;
  label: string | null;
};

type TeamResponse = {
  year: number;
  month: number; // 1-based
  users: TeamUser[];
  holidays: Record<string, number>;
  matrix: Record<string, { user_id: number; status: DayStatus }[]>;
};

const STATUS_DOT: Record<DayStatus, string> = {
  work: "bg-red-500",
  rest: "bg-green-500",
  vacation: "bg-yellow-400",
  holiday: "bg-purple-500",
  unemployed: "bg-[var(--tg-secbg)]",
};

const STATUS_LABEL: Record<DayStatus, string> = {
  work: "работает",
  rest: "отдыхает",
  vacation: "в отпуске",
  holiday: "праздник",
  unemployed: "без графика",
};

export default function CalendarPage() {
  const { auth, haptic, hapticTap, tg } = useTg();
  const today = todayMSK();
  const [cursor, setCursor] = useState(() => {
    const d = new Date(today);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  });
  const [showOnlyMe, setShowOnlyMe] = useState(false);
  const [data, setData] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (auth.status !== "ready") return;
    setLoading(true);
    try {
      const r = await api.get<TeamResponse>(
        `/api/team-calendar?year=${cursor.year}&month=${cursor.month}`,
      );
      setData(r);
    } finally {
      setLoading(false);
    }
  }, [auth.status, cursor]);

  useEffect(() => {
    void load();
  }, [load]);

  const cells = useMemo(() => buildCells(cursor.year, cursor.month), [cursor]);

  const myId = auth.status === "ready" ? auth.user.id : null;
  const usersById = useMemo(() => {
    const m: Record<number, TeamUser> = {};
    for (const u of data?.users ?? []) m[u.id] = u;
    return m;
  }, [data]);

  function shiftMonth(delta: number) {
    hapticTap();
    setCursor(({ year, month }) => {
      const n = month + delta;
      if (n < 1) return { year: year - 1, month: 12 };
      if (n > 12) return { year: year + 1, month: 1 };
      return { year, month: n };
    });
  }

  async function toggleMyDay(iso: string) {
    if (!myId || !data) return;
    const mine = data.matrix[iso]?.find((r) => r.user_id === myId);
    if (!mine) return;
    const kind = mine.status === "work" ? "rest" : "work";
    setSaving(true);
    try {
      await api.put("/api/me/overrides", { date: iso, is_work: kind === "work" });
      haptic("success");
      await load();
    } catch {
      haptic("error");
    } finally {
      setSaving(false);
    }
  }

  async function clearMyOverride(iso: string) {
    if (!myId) return;
    setSaving(true);
    try {
      await api.del(`/api/me/overrides?date=${iso}`);
      haptic("success");
      await load();
    } catch {
      haptic("error");
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = `${RU_MONTHS_NOM[cursor.month - 1]} ${cursor.year}`;

  return (
    <Shell title="календарь">
      <PageTransition>
        <div className="p-4 space-y-4 pb-6">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => shiftMonth(-1)}>
              ‹
            </Button>
            <motion.div
              key={monthLabel}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 text-center font-semibold"
            >
              {monthLabel}
            </motion.div>
            <Button variant="secondary" size="sm" onClick={() => shiftMonth(1)}>
              ›
            </Button>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl bg-[var(--tg-secbg)] p-1 text-sm">
            {([false, true] as const).map((v) => (
              <button
                key={v ? "me" : "all"}
                onClick={() => {
                  hapticTap();
                  setShowOnlyMe(v);
                }}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                  showOnlyMe === v ? "bg-[var(--tg-bg)] shadow-sm" : "text-hint"
                }`}
              >
                {v ? "только я" : "вся команда"}
              </button>
            ))}
          </div>

          {/* Weekday row */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-hint">
            {RU_WEEKDAYS_SHORT.map((w, i) => (
              <div
                key={w}
                className={i >= 5 ? "text-red-500/70" : undefined}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Grid */}
          {loading && !data ? (
            <CalendarSkeleton />
          ) : (
            <motion.div layout className="grid grid-cols-7 gap-1">
              {cells.map((iso, idx) => {
                if (!iso) return <div key={`e${idx}`} />;
                const dayUsers = data?.matrix[iso] ?? [];
                const holiday = data?.holidays[iso] === 1;
                const weekend = isWeekend(iso);
                return (
                  <DayCell
                    key={iso}
                    iso={iso}
                    today={today}
                    dayUsers={dayUsers}
                    usersById={usersById}
                    myId={myId}
                    showOnlyMe={showOnlyMe}
                    holiday={holiday}
                    weekend={weekend}
                    onClick={() => {
                      hapticTap();
                      setSelectedDate(iso);
                    }}
                  />
                );
              })}
            </motion.div>
          )}

          <Legend />

          {saving && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 text-xs bg-[var(--tg-secbg)] px-3 py-1.5 rounded-full shadow">
              сохраняю…
            </div>
          )}
        </div>

        <AnimatePresence>
          {selectedDate && data && (
            <DaySheet
              iso={selectedDate}
              dayUsers={data.matrix[selectedDate] ?? []}
              usersById={usersById}
              myId={myId}
              holiday={data.holidays[selectedDate] === 1}
              onClose={() => setSelectedDate(null)}
              onToggleMe={() => toggleMyDay(selectedDate)}
              onClearMe={() => clearMyOverride(selectedDate)}
              saving={saving}
            />
          )}
        </AnimatePresence>
      </PageTransition>
    </Shell>
  );
}

function buildCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const leading = weekdayMonFirst(first.toISOString().slice(0, 10));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: (string | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= days; d++) {
    out.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (out.length % 7) out.push(null);
  return out;
}

function isWeekend(iso: string): boolean {
  const wd = weekdayMonFirst(iso);
  return wd >= 5;
}

function DayCell({
  iso,
  today,
  dayUsers,
  usersById,
  myId,
  showOnlyMe,
  holiday,
  weekend,
  onClick,
}: {
  iso: string;
  today: string;
  dayUsers: { user_id: number; status: DayStatus }[];
  usersById: Record<number, TeamUser>;
  myId: number | null;
  showOnlyMe: boolean;
  holiday: boolean;
  weekend: boolean;
  onClick: () => void;
}) {
  const filtered = showOnlyMe && myId ? dayUsers.filter((u) => u.user_id === myId) : dayUsers;
  const workers = filtered.filter((u) => u.status === "work");
  const isToday = iso === today;
  const myStatus = myId ? dayUsers.find((u) => u.user_id === myId)?.status : undefined;

  const bg = myStatus
    ? myStatus === "work"
      ? "ring-red-500/40 bg-red-500/10"
      : myStatus === "vacation"
        ? "ring-yellow-400/40 bg-yellow-400/10"
        : myStatus === "holiday"
          ? "ring-purple-500/40 bg-purple-500/10"
          : "bg-[var(--tg-secbg)]"
    : "bg-[var(--tg-secbg)]";

  return (
    <motion.button
      layout
      whileTap={{ scale: 0.93 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={onClick}
      className={`relative aspect-square rounded-lg p-1 flex flex-col ring-1 ring-inset ${bg} ${
        isToday ? "ring-2 ring-[var(--tg-link)]" : "ring-transparent"
      }`}
    >
      <span
        className={`text-[11px] font-semibold self-start ${
          holiday ? "text-purple-500" : weekend ? "text-red-500/80" : "text-[var(--tg-fg)]"
        }`}
      >
        {Number(iso.slice(8, 10))}
      </span>
      <div className="mt-auto">
        <AvatarStack
          users={workers.slice(0, 3).map((w) => usersById[w.user_id]).filter(Boolean)}
          extra={Math.max(0, workers.length - 3)}
        />
      </div>
    </motion.button>
  );
}

function AvatarStack({ users, extra }: { users: TeamUser[]; extra: number }) {
  if (users.length === 0 && extra === 0) return null;
  return (
    <div className="flex -space-x-1.5 justify-center items-center">
      {users.map((u, i) => (
        <motion.div
          key={u.id}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: i * 0.04 }}
        >
          <Avatar user={u} size={18} />
        </motion.div>
      ))}
      {extra > 0 && (
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-[18px] h-[18px] rounded-full bg-[var(--tg-bg)] flex items-center justify-center text-[8px] font-bold border border-[var(--tg-secbg)]"
        >
          +{extra}
        </motion.div>
      )}
    </div>
  );
}

function Avatar({ user, size = 32 }: { user: TeamUser; size?: number }) {
  return (
    <SmartAvatar
      userId={user.id}
      name={user.name}
      src={user.photo_url}
      size={size}
    />
  );
}

function Legend() {
  const items: { label: string; color: string }[] = [
    { label: "работает", color: "bg-red-500" },
    { label: "отдых", color: "bg-green-500" },
    { label: "отпуск", color: "bg-yellow-400" },
    { label: "праздник", color: "bg-purple-500" },
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-hint">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${i.color}`} />
          <span>{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 42 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square" />
      ))}
    </div>
  );
}

function DaySheet({
  iso,
  dayUsers,
  usersById,
  myId,
  holiday,
  onClose,
  onToggleMe,
  onClearMe,
  saving,
}: {
  iso: string;
  dayUsers: { user_id: number; status: DayStatus }[];
  usersById: Record<number, TeamUser>;
  myId: number | null;
  holiday: boolean;
  onClose: () => void;
  onToggleMe: () => void;
  onClearMe: () => void;
  saving: boolean;
}) {
  const [y, m, d] = iso.split("-").map(Number);
  const wdIdx = weekdayMonFirst(iso);
  const wdLong = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"][wdIdx];
  const humanDate = `${wdLong}, ${d} ${RU_MONTHS_NOM[m - 1].slice(0, -1) === "ь" ? RU_MONTHS_NOM[m - 1] : RU_MONTHS_NOM[m - 1]}`;
  // Use short month in genitive for readability:
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const dateLabel = `${wdLong}, ${d} ${months[m - 1]} ${y}`;

  const grouped: Partial<Record<DayStatus, TeamUser[]>> = {};
  for (const u of dayUsers) {
    const usr = usersById[u.user_id];
    if (!usr) continue;
    (grouped[u.status] ??= []).push(usr);
  }

  const myStatus = myId ? dayUsers.find((u) => u.user_id === myId)?.status : undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-30 bg-black/50 flex items-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        exit={{ y: 80 }}
        transition={{ type: "spring", stiffness: 400, damping: 38 }}
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-3xl bg-[var(--tg-bg)] pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--tg-bg)] px-5 pt-3 pb-3 border-b border-[var(--tg-secbg)]">
          <div className="w-10 h-1 bg-[var(--tg-secbg)] rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-hint">
                {holiday && "🎉 праздник · "}
                {iso}
              </div>
              <div className="font-semibold">{dateLabel}</div>
            </div>
          </div>
        </div>

        <div className="px-5 pt-4 space-y-5">
          {(["work", "rest", "vacation", "holiday", "unemployed"] as DayStatus[]).map((st) => {
            const list = grouped[st];
            if (!list?.length) return null;
            return (
              <section key={st}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[st]}`} />
                  <span className="text-xs uppercase tracking-wider text-hint">
                    {STATUS_LABEL[st]} — {list.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {list.map((u, i) => (
                    <motion.div
                      key={u.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-3 py-1.5"
                    >
                      <Avatar user={u} size={32} />
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {u.name}
                          {u.id === myId && (
                            <span className="text-hint text-xs ml-1">— ты</span>
                          )}
                        </div>
                        {u.label && (
                          <div className="text-hint text-xs">{u.label}</div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            );
          })}

          {myId && myStatus && (
            <div className="pt-2 space-y-2">
              <div className="text-xs uppercase tracking-wider text-hint">
                твой день
              </div>
              <Button
                fullWidth
                variant={myStatus === "work" ? "secondary" : "primary"}
                loading={saving}
                onClick={onToggleMe}
              >
                {myStatus === "work" ? "😎 сделать выходным" : "🏃 сделать рабочим"}
              </Button>
              <button
                onClick={onClearMe}
                disabled={saving}
                className="w-full text-xs text-hint py-2"
              >
                вернуть по расписанию
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
