"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { api } from "@/lib/api";
import { RU_WEEKDAYS_SHORT } from "@/lib/format";
import {
  daysFromWeeklyMask,
  todayMSK,
  weeklyMaskFromDays,
  type UserSchedule,
} from "@/lib/schedule";

type MeResponse = {
  user: { id: number; first_name: string } | null;
  schedule: (UserSchedule & { label: string | null }) | null;
};

type Mode = "cycle" | "weekly" | "unemployed" | "custom";

export default function SchedulePage() {
  const { auth, haptic } = useTg();
  const [mode, setMode] = useState<Mode>("cycle");
  const [workDays, setWorkDays] = useState(3);
  const [restDays, setRestDays] = useState(2);
  const [startDate, setStartDate] = useState(todayMSK());
  const [weeklyMask, setWeeklyMask] = useState(0b0011111); // Mon-Fri
  const [respectHolidays, setRespectHolidays] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (auth.status !== "ready") return;
    api
      .get<MeResponse>("/api/me")
      .then((me) => {
        const s = me.schedule;
        if (!s) return;
        setMode(s.type);
        setRespectHolidays(s.respect_holidays);
        if (s.type === "cycle") {
          setWorkDays(s.work_days ?? 3);
          setRestDays(s.rest_days ?? 2);
          if (s.start_date) setStartDate(s.start_date);
        } else if (s.type === "weekly") {
          setWeeklyMask(s.weekly_mask ?? 0);
        }
      })
      .finally(() => setLoading(false));
  }, [auth.status]);

  async function save() {
    setSaving(true);
    setErr(null);
    setOk(false);
    try {
      let body: unknown;
      if (mode === "cycle") {
        body = {
          type: "cycle",
          work_days: workDays,
          rest_days: restDays,
          start_date: startDate,
          respect_holidays: respectHolidays,
        };
      } else if (mode === "weekly") {
        body = { type: "weekly", weekly_mask: weeklyMask, respect_holidays: respectHolidays };
      } else {
        body = { type: mode };
      }
      await api.put<{ ok: true }>("/api/me/schedule", body);
      haptic("success");
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    } catch (e) {
      haptic("error");
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell title="мой график">
      <div className="p-4 space-y-5">
        {loading ? (
          <div className="text-hint text-sm">загружаю…</div>
        ) : (
          <>
            <Tabs
              value={mode}
              onChange={(m) => setMode(m)}
              tabs={[
                { value: "cycle", label: "цикл" },
                { value: "weekly", label: "недельный" },
                { value: "unemployed", label: "безработный" },
                { value: "custom", label: "ручной" },
              ]}
            />

            {mode === "cycle" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <NumberRow
                    label="работаю"
                    value={workDays}
                    onChange={setWorkDays}
                    min={1}
                    max={30}
                  />
                  <NumberRow
                    label="отдыхаю"
                    value={restDays}
                    onChange={setRestDays}
                    min={0}
                    max={30}
                  />
                </div>
                <Field label="день начала цикла">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-[var(--tg-secbg)] rounded-lg px-3 py-2"
                  />
                </Field>
                <p className="text-hint text-xs">
                  с этой даты идёт счёт: {workDays} дн. работы, потом {restDays} дн. отдыха,
                  по кругу.
                </p>
              </div>
            )}

            {mode === "weekly" && (
              <div className="space-y-3">
                <Field label="рабочие дни недели">
                  <div className="grid grid-cols-7 gap-1">
                    {RU_WEEKDAYS_SHORT.map((name, i) => {
                      const on = (weeklyMask & (1 << i)) !== 0;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            const days = daysFromWeeklyMask(weeklyMask);
                            const next = on
                              ? days.filter((d) => d !== i)
                              : [...days, i];
                            setWeeklyMask(weeklyMaskFromDays(next));
                          }}
                          className={`py-2 rounded-lg text-sm ${
                            on
                              ? "bg-btn text-btn-fg"
                              : "bg-[var(--tg-secbg)] text-hint"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <p className="text-hint text-xs">
                  пометь дни, в которые работаешь. остальные — выходные.
                </p>
              </div>
            )}

            {mode === "unemployed" && (
              <div className="rounded-xl bg-[var(--tg-secbg)] p-4 text-hint text-sm">
                лежишь на диване. никто не ждёт на работе. уважение 😎
              </div>
            )}

            {mode === "custom" && (
              <div className="rounded-xl bg-[var(--tg-secbg)] p-4 text-hint text-sm">
                график полностью ручной — заходи в календарь и ставь метки по дням.
              </div>
            )}

            {(mode === "cycle" || mode === "weekly") && (
              <label className="flex items-center justify-between rounded-xl bg-[var(--tg-secbg)] px-4 py-3">
                <span>учитывать праздники РФ</span>
                <input
                  type="checkbox"
                  checked={respectHolidays}
                  onChange={(e) => setRespectHolidays(e.target.checked)}
                  className="w-5 h-5"
                />
              </label>
            )}

            {err && <div className="text-red-500 text-sm">{err}</div>}
            {ok && <div className="text-green-600 text-sm">сохранено ✓</div>}

            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-xl bg-btn text-btn-fg py-3 font-semibold disabled:opacity-60"
            >
              {saving ? "сохраняю…" : "сохранить"}
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}

function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: string }[];
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-xl bg-[var(--tg-secbg)]">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`py-1.5 rounded-lg text-xs font-medium ${
            value === t.value ? "bg-[var(--tg-bg)] shadow-sm" : "text-hint"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wider text-hint">{label}</div>
      {children}
    </div>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="rounded-xl bg-[var(--tg-secbg)] p-3">
      <div className="text-xs uppercase tracking-wider text-hint mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-9 h-9 rounded-lg bg-[var(--tg-bg)]"
        >
          −
        </button>
        <div className="flex-1 text-center text-xl font-semibold">{value}</div>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-9 h-9 rounded-lg bg-[var(--tg-bg)]"
        >
          +
        </button>
      </div>
    </div>
  );
}
