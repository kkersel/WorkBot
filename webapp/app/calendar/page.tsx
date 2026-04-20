"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { api } from "@/lib/api";
import { RU_MONTHS_NOM, RU_WEEKDAYS_SHORT } from "@/lib/format";
import {
  dayStatus,
  todayMSK,
  weekdayMonFirst,
  type DayStatus,
  type Override,
  type UserSchedule,
} from "@/lib/schedule";

type MeResponse = {
  user: { id: number } | null;
  schedule: (UserSchedule & { label: string | null }) | null;
};

type OverridesResponse = { overrides: Override[] };
type CalendarResponse = { year: number; holidays: Record<string, number> };

const STATUS_COLOR: Record<DayStatus, string> = {
  work: "bg-red-500/90",
  rest: "bg-green-500/80",
  vacation: "bg-yellow-400/80",
  holiday: "bg-purple-500/80",
  unemployed: "bg-[var(--tg-secbg)]",
};

function monthStart(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
function monthEnd(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month + 1, 0));
  return d.toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const { auth, haptic } = useTg();
  const today = todayMSK();
  const [cursor, setCursor] = useState(() => {
    const d = new Date(today);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

  const [schedule, setSchedule] = useState<(UserSchedule & { label: string | null }) | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [holidays, setHolidays] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (auth.status !== "ready") return;
    api
      .get<MeResponse>("/api/me")
      .then((r) => setSchedule(r.schedule))
      .catch(() => {});
  }, [auth.status]);

  const load = useCallback(async () => {
    if (auth.status !== "ready") return;
    const from = monthStart(cursor.year, cursor.month);
    const to = monthEnd(cursor.year, cursor.month);
    const [ov, cal] = await Promise.all([
      api.get<OverridesResponse>(`/api/me/overrides?from=${from}&to=${to}`),
      api.get<CalendarResponse>(`/api/calendar?year=${cursor.year}`),
    ]);
    setOverrides(ov.overrides);
    setHolidays(cal.holidays);
  }, [auth.status, cursor]);

  useEffect(() => {
    void load();
  }, [load]);

  const cells = useMemo(() => buildCells(cursor.year, cursor.month), [cursor]);

  function statusFor(iso: string): DayStatus {
    const s: UserSchedule = schedule ?? { type: "unemployed", respect_holidays: true };
    return dayStatus(iso, s, overrides, [], holidays);
  }

  async function setOverride(iso: string, kind: "work" | "rest" | null) {
    setSaving(true);
    try {
      if (kind === null) {
        await api.del(`/api/me/overrides?date=${iso}`);
      } else {
        await api.put("/api/me/overrides", { date: iso, is_work: kind === "work" });
      }
      haptic("success");
      await load();
    } catch {
      haptic("error");
    } finally {
      setSaving(false);
      setSelected(null);
    }
  }

  const monthLabel = `${RU_MONTHS_NOM[cursor.month]} ${cursor.year}`;

  return (
    <Shell title="календарь">
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setCursor(({ year, month }) =>
                month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
              )
            }
            className="px-3 py-1.5 rounded-lg bg-[var(--tg-secbg)] text-sm"
          >
            ‹
          </button>
          <div className="flex-1 text-center font-medium">{monthLabel}</div>
          <button
            onClick={() =>
              setCursor(({ year, month }) =>
                month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
              )
            }
            className="px-3 py-1.5 rounded-lg bg-[var(--tg-secbg)] text-sm"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-hint">
          {RU_WEEKDAYS_SHORT.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((iso, idx) => {
            if (!iso) return <div key={`e${idx}`} />;
            const st = statusFor(iso);
            const hasOverride = overrides.some((o) => o.date === iso);
            const isToday = iso === today;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                className={`aspect-square rounded-lg text-xs relative ${STATUS_COLOR[st]} ${
                  isToday ? "ring-2 ring-[var(--tg-link)]" : ""
                } text-white`}
              >
                <span className="absolute top-1 left-1.5 font-medium">
                  {Number(iso.slice(8, 10))}
                </span>
                {hasOverride && (
                  <span className="absolute bottom-1 right-1 text-[8px]">✎</span>
                )}
              </button>
            );
          })}
        </div>

        <Legend />

        {selected && (
          <DayEditor
            iso={selected}
            status={statusFor(selected)}
            overridden={overrides.some((o) => o.date === selected)}
            saving={saving}
            onClose={() => setSelected(null)}
            onSet={(kind) => setOverride(selected, kind)}
          />
        )}
      </div>
    </Shell>
  );
}

function buildCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const leading = weekdayMonFirst(first.toISOString().slice(0, 10));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

function Legend() {
  const items: { label: string; color: string }[] = [
    { label: "работа", color: "bg-red-500/90" },
    { label: "отдых", color: "bg-green-500/80" },
    { label: "отпуск", color: "bg-yellow-400/80" },
    { label: "праздник", color: "bg-purple-500/80" },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-hint">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded ${i.color}`} />
          <span>{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function DayEditor({
  iso,
  status,
  overridden,
  saving,
  onClose,
  onSet,
}: {
  iso: string;
  status: DayStatus;
  overridden: boolean;
  saving: boolean;
  onClose: () => void;
  onSet: (kind: "work" | "rest" | null) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 bg-black/40 flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-[var(--tg-bg)] p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-hint text-xs uppercase tracking-wider">
            {iso}
          </div>
          <div className="font-semibold">
            статус: {STATUS_LABEL[status]}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={saving}
            onClick={() => onSet("work")}
            className="rounded-lg bg-red-500 text-white py-3 font-medium disabled:opacity-60"
          >
            🏃 работать
          </button>
          <button
            disabled={saving}
            onClick={() => onSet("rest")}
            className="rounded-lg bg-green-600 text-white py-3 font-medium disabled:opacity-60"
          >
            😎 отдых
          </button>
        </div>
        {overridden && (
          <button
            disabled={saving}
            onClick={() => onSet(null)}
            className="w-full rounded-lg bg-[var(--tg-secbg)] text-hint py-2.5 text-sm disabled:opacity-60"
          >
            вернуть по графику
          </button>
        )}
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-[var(--tg-secbg)] py-2.5 text-sm"
        >
          закрыть
        </button>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<DayStatus, string> = {
  work: "работа 🏃",
  rest: "отдых 😎",
  vacation: "отпуск 🏖",
  holiday: "праздник 🎉",
  unemployed: "без графика",
};
