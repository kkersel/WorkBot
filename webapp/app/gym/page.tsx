"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { Button } from "@/components/ui/Button";
import { PageTransition } from "@/components/ui/PageTransition";
import { Skeleton } from "@/components/ui/Skeleton";
import { SmartAvatar } from "@/components/ui/SmartAvatar";
import { api } from "@/lib/api";
import { RU_WEEKDAYS_SHORT } from "@/lib/format";

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

type GymDay = { label?: string; optional?: boolean };
type MyPlan = {
  user_id: number;
  enabled: boolean;
  days: Record<string, GymDay>;
  evening_poll: boolean;
};

type GlobalSettings = { poll_hour_msk: number };

export default function GymPage() {
  const { auth, haptic, hapticTap } = useTg();
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [plan, setPlan] = useState<MyPlan | null>(null);
  const [settings, setSettings] = useState<{ settings: GlobalSettings; can_edit: boolean } | null>(
    null,
  );
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
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

  useEffect(() => {
    if (auth.status !== "ready") return;
    loadToday();
    api
      .get<{ plan: MyPlan }>("/api/me/gym")
      .then((r) => setPlan(r.plan))
      .catch(() => {});
    api
      .get<{ settings: GlobalSettings; can_edit: boolean }>("/api/gym/settings")
      .then(setSettings)
      .catch(() => {});
  }, [auth.status, loadToday]);

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

  async function toggleEnabled(next: boolean) {
    if (!plan) return;
    setPlan({ ...plan, enabled: next });
  }

  async function toggleDay(i: number) {
    if (!plan) return;
    hapticTap();
    const k = String(i);
    const days = { ...plan.days };
    if (days[k]) delete days[k];
    else days[k] = { label: "", optional: false };
    setPlan({ ...plan, days });
  }

  function setLabel(i: number, label: string) {
    if (!plan) return;
    const k = String(i);
    const days = { ...plan.days, [k]: { ...(plan.days[k] ?? {}), label } };
    setPlan({ ...plan, days });
  }

  function setOptional(i: number, optional: boolean) {
    if (!plan) return;
    hapticTap();
    const k = String(i);
    const days = { ...plan.days, [k]: { ...(plan.days[k] ?? {}), optional } };
    setPlan({ ...plan, days });
  }

  async function savePlan() {
    if (!plan) return;
    setSavingPlan(true);
    try {
      await api.put("/api/me/gym", {
        enabled: plan.enabled,
        days: plan.days,
        evening_poll: plan.evening_poll,
      });
      haptic("success");
      await loadToday();
    } catch (e) {
      haptic("error");
      setError((e as Error).message);
    } finally {
      setSavingPlan(false);
    }
  }

  async function saveSettings(hour: number) {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const r = await api.put<{ settings: GlobalSettings }>("/api/gym/settings", {
        poll_hour_msk: hour,
      });
      setSettings({ settings: r.settings, can_edit: true });
      haptic("success");
    } catch (e) {
      haptic("error");
      setError((e as Error).message);
    } finally {
      setSavingSettings(false);
    }
  }

  const isAdmin = settings?.can_edit ?? false;

  return (
    <Shell title="зал">
      <PageTransition>
        <div className="p-4 space-y-5 pb-6">
          {/* Today block */}
          {today === null ? (
            <Skeleton className="h-36" />
          ) : today.is_gym_day ? (
            <TodayBlock
              today={today}
              myId={auth.status === "ready" ? auth.user.id : null}
              isAdmin={isAdmin}
              pingedIds={pingedIds}
              onPing={ping}
            />
          ) : (
            <div className="rounded-2xl bg-[var(--tg-secbg)] p-4 text-center text-hint text-sm">
              сегодня не день зала — отдыхаем 😌
            </div>
          )}

          {/* Admin global settings */}
          {settings && isAdmin && (
            <section className="rounded-2xl bg-[var(--tg-secbg)] p-4 space-y-3 ring-1 ring-[var(--tg-link)]/40">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">⚙️ настройки чата</span>
                <span className="text-[10px] text-hint uppercase tracking-wider">
                  admin
                </span>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-hint">во сколько бот спрашивает всех (МСК)</div>
                <HourPicker
                  value={settings.settings.poll_hour_msk}
                  onChange={saveSettings}
                  saving={savingSettings}
                />
              </div>
            </section>
          )}

          {/* My settings */}
          {plan === null ? (
            <Skeleton className="h-48" />
          ) : (
            <section className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-hint px-1">
                мои настройки
              </div>

              <motion.label
                layout
                className="flex items-center justify-between rounded-2xl bg-[var(--tg-secbg)] px-4 py-3"
              >
                <div>
                  <div className="font-medium">напоминания</div>
                  <div className="text-hint text-xs">
                    {plan.enabled ? "бот будет спрашивать" : "без напоминаний"}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={plan.enabled}
                  onChange={(e) => toggleEnabled(e.target.checked)}
                  className="w-5 h-5"
                />
              </motion.label>

              <div className="space-y-2">
                <div className="text-xs text-hint px-1">мои дни зала</div>
                <div className="grid grid-cols-7 gap-1">
                  {RU_WEEKDAYS_SHORT.map((name, i) => {
                    const on = !!plan.days[String(i)];
                    return (
                      <motion.button
                        key={i}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => toggleDay(i)}
                        className={`py-2.5 rounded-xl text-sm font-medium ${
                          on ? "bg-btn text-btn-fg" : "bg-[var(--tg-secbg)] text-hint"
                        }`}
                      >
                        {name}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence>
                {Object.keys(plan.days)
                  .sort()
                  .map((k) => {
                    const i = Number(k);
                    const d = plan.days[k];
                    return (
                      <motion.div
                        key={k}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="bg-[var(--tg-secbg)] rounded-xl p-3 space-y-2"
                      >
                        <div className="text-sm font-medium">
                          {RU_WEEKDAYS_SHORT[i]}
                        </div>
                        <input
                          type="text"
                          placeholder="тема (ноги / спина…) — необязательно"
                          value={d.label ?? ""}
                          onChange={(e) => setLabel(i, e.target.value)}
                          className="w-full bg-[var(--tg-bg)] rounded-lg px-2 py-1.5 text-sm"
                        />
                        <label className="flex items-center gap-2 text-xs text-hint">
                          <input
                            type="checkbox"
                            checked={!!d.optional}
                            onChange={(e) => setOptional(i, e.target.checked)}
                          />
                          опциональный день (можно слить без стыда)
                        </label>
                      </motion.div>
                    );
                  })}
              </AnimatePresence>
            </section>
          )}

          {error && <div className="text-red-500 text-sm">{error}</div>}

          {plan && (
            <div className="sticky bottom-0 -mx-4 px-4 pt-2 bg-gradient-to-t from-[var(--tg-bg)] via-[var(--tg-bg)] to-transparent">
              <Button fullWidth size="lg" loading={savingPlan} onClick={savePlan}>
                сохранить мои настройки
              </Button>
            </div>
          )}
        </div>
      </PageTransition>
    </Shell>
  );
}

function TodayBlock({
  today,
  myId,
  isAdmin,
  pingedIds,
  onPing,
}: {
  today: TodayResponse;
  myId: number | null;
  isAdmin: boolean;
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
        <Group
          icon="✅"
          title="идут"
          people={yes}
          myId={myId}
        />
        <Group
          icon="❌"
          title="сливают"
          people={no}
          myId={myId}
        />
        <Group
          icon="🕐"
          title="не ответили"
          people={pending}
          myId={myId}
          actions={(p) =>
            isAdmin && p.user_id !== myId ? (
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
    <motion.div
      layout
      className={`rounded-xl ${color} py-2`}
    >
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
        <AnimatePresence>
          {people.map((p, i) => (
            <motion.div
              key={p.user_id}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 bg-[var(--tg-bg)] rounded-lg px-3 py-2"
            >
              <SmartAvatar userId={p.user_id} name={p.name} src={p.photo_url} size={28} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {p.name}
                  {p.user_id === myId && (
                    <span className="text-hint text-xs ml-1">— ты</span>
                  )}
                </div>
                {p.label && <div className="text-[11px] text-hint">{p.label}</div>}
              </div>
              {actions?.(p)}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function HourPicker({
  value,
  onChange,
  saving,
}: {
  value: number;
  onChange: (hour: number) => void;
  saving: boolean;
}) {
  const { hapticTap } = useTg();
  const quick = [12, 16, 18, 19, 20, 21, 22];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {quick.map((h) => (
          <motion.button
            key={h}
            whileTap={{ scale: 0.92 }}
            disabled={saving}
            onClick={() => {
              hapticTap();
              onChange(h);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
              value === h ? "bg-btn text-btn-fg" : "bg-[var(--tg-bg)] text-hint"
            }`}
          >
            {h}:00
          </motion.button>
        ))}
      </div>
      <div className="flex items-center gap-2 bg-[var(--tg-bg)] rounded-xl px-3 py-2">
        <input
          type="number"
          min={0}
          max={23}
          value={value}
          disabled={saving}
          onChange={(e) => {
            const h = Math.max(0, Math.min(23, Number(e.target.value) || 0));
            onChange(h);
          }}
          className="flex-1 bg-transparent outline-none text-lg font-semibold tabular-nums"
        />
        <span className="text-hint text-xs">:00 МСК</span>
      </div>
    </div>
  );
}
