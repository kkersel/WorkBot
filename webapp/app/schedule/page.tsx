"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { Button } from "@/components/ui/Button";
import { PageTransition } from "@/components/ui/PageTransition";
import { Skeleton } from "@/components/ui/Skeleton";
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

type Parsed =
  | {
      kind: "cycle";
      work_days: number;
      rest_days: number;
      start_date: string;
      respect_holidays: boolean;
    }
  | { kind: "weekly"; weekdays: number[]; respect_holidays: boolean }
  | { kind: "unemployed" }
  | { kind: "unknown"; hint: string };

type Draft =
  | { kind: "cycle"; work: number; rest: number; start: string }
  | { kind: "weekly"; days: number[] }
  | { kind: "unemployed" }
  | null;

const PRESETS: { label: string; subtitle: string; draft: Draft }[] = [
  { label: "2/2", subtitle: "2 дн / 2 дн", draft: { kind: "cycle", work: 2, rest: 2, start: "" } },
  { label: "3/2", subtitle: "3 дн / 2 дн", draft: { kind: "cycle", work: 3, rest: 2, start: "" } },
  { label: "5/2", subtitle: "будни", draft: { kind: "weekly", days: [0, 1, 2, 3, 4] } },
  { label: "7/7", subtitle: "неделя через неделю", draft: { kind: "cycle", work: 7, rest: 7, start: "" } },
  { label: "1/3", subtitle: "сутки через трое", draft: { kind: "cycle", work: 1, rest: 3, start: "" } },
  { label: "не работаю", subtitle: "безработный 😎", draft: { kind: "unemployed" } },
];

export default function SchedulePage() {
  const { auth, haptic, hapticTap } = useTg();
  const today = todayMSK();
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(null);
  const [respectHolidays, setRespectHolidays] = useState(true);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);

  // load current schedule → hydrate draft
  useEffect(() => {
    if (auth.status !== "ready") return;
    api
      .get<MeResponse>("/api/me")
      .then((me) => {
        const s = me.schedule;
        if (!s) return;
        setRespectHolidays(s.respect_holidays);
        if (s.type === "cycle" && s.work_days && s.rest_days != null && s.start_date) {
          setDraft({ kind: "cycle", work: s.work_days, rest: s.rest_days, start: s.start_date });
        } else if (s.type === "weekly" && s.weekly_mask != null) {
          setDraft({ kind: "weekly", days: daysFromWeeklyMask(s.weekly_mask) });
        } else if (s.type === "unemployed") {
          setDraft({ kind: "unemployed" });
        }
      })
      .finally(() => setLoading(false));
  }, [auth.status]);

  function applyPreset(d: Draft) {
    hapticTap();
    if (d?.kind === "cycle") setDraft({ ...d, start: d.start || today });
    else setDraft(d);
  }

  async function askAi() {
    if (!aiText.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const r = await api.post<{ parsed: Parsed }>("/api/ai/parse-schedule", {
        text: aiText.trim(),
        today,
      });
      const p = r.parsed;
      if (p.kind === "unknown") {
        haptic("warning");
        setAiError(p.hint || "не понял, уточни");
        return;
      }
      if (p.kind === "cycle") {
        setDraft({
          kind: "cycle",
          work: p.work_days,
          rest: p.rest_days,
          start: p.start_date || today,
        });
        setRespectHolidays(p.respect_holidays);
      } else if (p.kind === "weekly") {
        setDraft({ kind: "weekly", days: p.weekdays });
        setRespectHolidays(p.respect_holidays);
      } else if (p.kind === "unemployed") {
        setDraft({ kind: "unemployed" });
      }
      haptic("success");
      setAiText("");
    } catch (e) {
      haptic("error");
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      if (draft.kind === "cycle") {
        await api.put("/api/me/schedule", {
          type: "cycle",
          work_days: draft.work,
          rest_days: draft.rest,
          start_date: draft.start || today,
          respect_holidays: respectHolidays,
        });
      } else if (draft.kind === "weekly") {
        await api.put("/api/me/schedule", {
          type: "weekly",
          weekly_mask: weeklyMaskFromDays(draft.days),
          respect_holidays: respectHolidays,
        });
      } else if (draft.kind === "unemployed") {
        await api.put("/api/me/schedule", { type: "unemployed" });
      }
      haptic("success");
      setOk(true);
      setTimeout(() => setOk(false), 1600);
    } catch (e) {
      haptic("error");
      setAiError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell title="мой график">
      <PageTransition>
        <div className="p-4 space-y-5 pb-6">
          {loading ? (
            <LoadingState />
          ) : (
            <>
              <Preview draft={draft} today={today} />

              <AiBar
                text={aiText}
                onChange={setAiText}
                loading={aiLoading}
                error={aiError}
                onAsk={askAi}
              />

              <section>
                <div className="text-xs uppercase tracking-wider text-hint mb-2 px-1">
                  шаблоны
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map((p) => (
                    <PresetTile
                      key={p.label}
                      label={p.label}
                      subtitle={p.subtitle}
                      active={isSamePreset(p.draft, draft)}
                      onClick={() => applyPreset(p.draft)}
                    />
                  ))}
                </div>
              </section>

              {draft?.kind === "weekly" && (
                <WeekdayPicker
                  days={draft.days}
                  onChange={(days) => setDraft({ kind: "weekly", days })}
                />
              )}

              {draft?.kind === "cycle" && (
                <CycleEditor
                  work={draft.work}
                  rest={draft.rest}
                  start={draft.start || today}
                  onChange={(next) =>
                    setDraft({
                      kind: "cycle",
                      work: next.work,
                      rest: next.rest,
                      start: next.start,
                    })
                  }
                />
              )}

              {draft && draft.kind !== "unemployed" && (
                <motion.label
                  layout
                  className="flex items-center justify-between rounded-2xl bg-[var(--tg-secbg)] px-4 py-3"
                >
                  <span className="text-sm">учитывать праздники РФ</span>
                  <input
                    type="checkbox"
                    checked={respectHolidays}
                    onChange={(e) => {
                      hapticTap();
                      setRespectHolidays(e.target.checked);
                    }}
                    className="w-5 h-5"
                  />
                </motion.label>
              )}

              <div className="sticky bottom-0 -mx-4 px-4 pt-2 bg-gradient-to-t from-[var(--tg-bg)] via-[var(--tg-bg)] to-transparent">
                <Button
                  fullWidth
                  size="lg"
                  loading={saving}
                  disabled={!draft}
                  onClick={save}
                >
                  {ok ? "сохранено ✓" : "сохранить"}
                </Button>
              </div>
            </>
          )}
        </div>
      </PageTransition>
    </Shell>
  );
}

function isSamePreset(a: Draft, b: Draft): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "cycle" && b.kind === "cycle") return a.work === b.work && a.rest === b.rest;
  if (a.kind === "weekly" && b.kind === "weekly")
    return a.days.slice().sort().join(",") === b.days.slice().sort().join(",");
  return a.kind === b.kind;
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24" />
      <Skeleton className="h-14" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}

function Preview({ draft, today }: { draft: Draft; today: string }) {
  let title = "выбери шаблон или опиши словами";
  let sub = "";
  if (draft?.kind === "cycle") {
    title = `${draft.work}/${draft.rest}`;
    sub = `цикл: ${draft.work} дн работы → ${draft.rest} дн отдыха`;
  } else if (draft?.kind === "weekly") {
    title = draft.days.length
      ? draft.days.map((d) => RU_WEEKDAYS_SHORT[d]).join(" · ")
      : "—";
    sub = "повторяется каждую неделю";
  } else if (draft?.kind === "unemployed") {
    title = "не работаю 😎";
    sub = "бот не будет трогать";
  }
  return (
    <motion.div
      layout
      className="rounded-2xl bg-[var(--tg-secbg)] p-5 text-center pop-in"
    >
      <div className="text-xs uppercase tracking-wider text-hint">мой график</div>
      <div className="text-2xl font-semibold mt-1">{title}</div>
      {sub && <div className="text-hint text-xs mt-1">{sub}</div>}
      {draft?.kind === "cycle" && (
        <div className="mt-3">
          <MiniTimeline
            days={21}
            isWorking={(i) => isWorkingCycle(i, draft.work, draft.rest, draft.start || today, today)}
          />
        </div>
      )}
      {draft?.kind === "weekly" && (
        <div className="mt-3">
          <MiniTimeline
            days={14}
            isWorking={(i) => isWorkingWeekly(i, draft.days, today)}
          />
        </div>
      )}
    </motion.div>
  );
}

function MiniTimeline({ days, isWorking }: { days: number; isWorking: (i: number) => boolean }) {
  return (
    <div className="flex gap-1 justify-center">
      {Array.from({ length: days }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: i * 0.012, duration: 0.18 }}
          className={`w-2 h-6 rounded-sm ${
            isWorking(i) ? "bg-btn" : "bg-[var(--tg-bg)]"
          } ${i === 0 ? "ring-2 ring-[var(--tg-link)]" : ""}`}
        />
      ))}
    </div>
  );
}

function isWorkingCycle(i: number, work: number, rest: number, start: string, today: string) {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const delta = Math.round((todayMs - startMs) / 86400000) + i;
  if (delta < 0) return false;
  const cycle = work + rest;
  if (cycle === 0) return false;
  return delta % cycle < work;
}

function isWorkingWeekly(i: number, days: number[], today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + i));
  const wd = (dt.getUTCDay() + 6) % 7; // Mon-first
  return days.includes(wd);
}

function AiBar({
  text,
  onChange,
  loading,
  error,
  onAsk,
}: {
  text: string;
  onChange: (v: string) => void;
  loading: boolean;
  error: string | null;
  onAsk: () => void;
}) {
  return (
    <motion.div layout className="space-y-1.5">
      <div className="text-xs uppercase tracking-wider text-hint px-1">
        ✨ опиши словами
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) onAsk();
          }}
          placeholder="например «2 через 2, старт с завтра»"
          className="flex-1 rounded-xl bg-[var(--tg-secbg)] px-4 py-2.5 text-[15px] placeholder:text-hint outline-none focus:ring-2 focus:ring-[var(--tg-link)]"
        />
        <Button loading={loading} onClick={onAsk} disabled={!text.trim()}>
          разобрать
        </Button>
      </div>
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-red-500 px-1"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PresetTile({
  label,
  subtitle,
  active,
  onClick,
}: {
  label: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={onClick}
      className={`rounded-2xl p-3 flex flex-col items-center justify-center gap-0.5 min-h-[80px] transition-colors ${
        active
          ? "bg-btn text-btn-fg ring-2 ring-[var(--tg-link)]"
          : "bg-[var(--tg-secbg)]"
      }`}
    >
      <div className="font-semibold text-[15px]">{label}</div>
      <div className={`text-[10px] ${active ? "opacity-80" : "text-hint"}`}>
        {subtitle}
      </div>
    </motion.button>
  );
}

function WeekdayPicker({
  days,
  onChange,
}: {
  days: number[];
  onChange: (d: number[]) => void;
}) {
  const { hapticTap } = useTg();
  return (
    <motion.div layout className="space-y-1.5">
      <div className="text-xs uppercase tracking-wider text-hint px-1">рабочие дни</div>
      <div className="grid grid-cols-7 gap-1">
        {RU_WEEKDAYS_SHORT.map((name, i) => {
          const on = days.includes(i);
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                hapticTap();
                onChange(on ? days.filter((d) => d !== i) : [...days, i]);
              }}
              className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                on
                  ? "bg-btn text-btn-fg"
                  : "bg-[var(--tg-secbg)] text-hint"
              }`}
            >
              {name}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

function CycleEditor({
  work,
  rest,
  start,
  onChange,
}: {
  work: number;
  rest: number;
  start: string;
  onChange: (v: { work: number; rest: number; start: string }) => void;
}) {
  return (
    <motion.div layout className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stepper
          label="работаю"
          value={work}
          min={1}
          max={30}
          onChange={(v) => onChange({ work: v, rest, start })}
        />
        <Stepper
          label="отдыхаю"
          value={rest}
          min={0}
          max={30}
          onChange={(v) => onChange({ work, rest: v, start })}
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs uppercase tracking-wider text-hint px-1">
          начало цикла
        </div>
        <input
          type="date"
          value={start}
          onChange={(e) => onChange({ work, rest, start: e.target.value })}
          className="w-full bg-[var(--tg-secbg)] rounded-xl px-4 py-2.5"
        />
      </div>
    </motion.div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const { hapticTap } = useTg();
  return (
    <div className="rounded-2xl bg-[var(--tg-secbg)] p-3">
      <div className="text-xs uppercase tracking-wider text-hint text-center mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => {
            hapticTap();
            onChange(Math.max(min, value - 1));
          }}
          className="w-9 h-9 rounded-xl bg-[var(--tg-bg)] text-lg font-semibold"
        >
          −
        </motion.button>
        <motion.div
          key={value}
          initial={{ scale: 0.85, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="flex-1 text-center text-2xl font-bold tabular-nums"
        >
          {value}
        </motion.div>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => {
            hapticTap();
            onChange(Math.min(max, value + 1));
          }}
          className="w-9 h-9 rounded-xl bg-[var(--tg-bg)] text-lg font-semibold"
        >
          +
        </motion.button>
      </div>
    </div>
  );
}
