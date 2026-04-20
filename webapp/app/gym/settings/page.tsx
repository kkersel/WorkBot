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

type GymDay = { label?: string; optional?: boolean };

type MyPlan = {
  user_id: number;
  enabled: boolean;
  days: Record<string, GymDay>;
  evening_poll: boolean;
};

type GlobalSettings = { poll_hour_msk: number };

export default function GymSettingsPage() {
  const { auth, haptic, hapticTap } = useTg();
  const [plan, setPlan] = useState<MyPlan | null>(null);
  const [settings, setSettings] = useState<{ settings: GlobalSettings; can_edit: boolean } | null>(
    null,
  );
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== "ready") return;
    api
      .get<{ plan: MyPlan }>("/api/me/gym")
      .then((r) => setPlan(r.plan))
      .catch(() => {});
    api
      .get<{ settings: GlobalSettings; can_edit: boolean }>("/api/gym/settings")
      .then(setSettings)
      .catch(() => {});
  }, [auth.status]);

  const isAdmin = settings?.can_edit ?? false;

  function toggleEnabled(next: boolean) {
    if (!plan) return;
    setPlan({ ...plan, enabled: next });
  }
  function toggleDay(i: number) {
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
  function setEveningPoll(next: boolean) {
    if (!plan) return;
    setPlan({ ...plan, evening_poll: next });
  }

  async function savePlan() {
    if (!plan) return;
    setSavingPlan(true);
    setError(null);
    try {
      await api.put("/api/me/gym", {
        enabled: plan.enabled,
        days: plan.days,
        evening_poll: plan.evening_poll,
      });
      haptic("success");
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    } catch (e) {
      haptic("error");
      setError((e as Error).message);
    } finally {
      setSavingPlan(false);
    }
  }

  async function saveHour(hour: number) {
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

  return (
    <Shell title="настройки зала" back>
      <PageTransition>
        <div className="p-4 space-y-6 pb-6">
          {/* Admin section */}
          {settings && isAdmin && (
            <section className="rounded-2xl bg-[var(--tg-secbg)] p-4 space-y-4 ring-1 ring-[var(--tg-link)]/40">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">⚙️ общие настройки</span>
                <span className="text-[10px] text-hint uppercase tracking-wider">admin</span>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-hint">во сколько бот спрашивает всех (МСК)</div>
                <HourPicker
                  value={settings.settings.poll_hour_msk}
                  onChange={saveHour}
                  saving={savingSettings}
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-xs text-hint">
                  отправит пинг всей группе прямо сейчас (для теста)
                </div>
                <BroadcastButton />
              </div>
            </section>
          )}

          {/* Personal */}
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
                  <div className="font-medium">участвую в опросе</div>
                  <div className="text-hint text-xs">
                    {plan.enabled
                      ? "бот будет меня спрашивать"
                      : "без напоминаний (не буду в списке)"}
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

              <motion.label
                layout
                className="flex items-center justify-between rounded-2xl bg-[var(--tg-secbg)] px-4 py-3"
              >
                <div>
                  <div className="font-medium">личный DM</div>
                  <div className="text-hint text-xs">
                    бот пишет мне в личку в день зала
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={plan.evening_poll}
                  onChange={(e) => setEveningPoll(e.target.checked)}
                  className="w-5 h-5"
                />
              </motion.label>
            </section>
          )}

          {error && <div className="text-red-500 text-sm">{error}</div>}

          {plan && (
            <div className="sticky bottom-0 -mx-4 px-4 pt-2 bg-gradient-to-t from-[var(--tg-bg)] via-[var(--tg-bg)] to-transparent">
              <Button fullWidth size="lg" loading={savingPlan} onClick={savePlan}>
                {ok ? "сохранено ✓" : "сохранить"}
              </Button>
            </div>
          )}
        </div>
      </PageTransition>
    </Shell>
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

function BroadcastButton() {
  const { haptic } = useTg();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    try {
      await api.post("/api/gym/broadcast", {});
      setState("sent");
      haptic("success");
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setState("error");
      haptic("error");
      setError((e as Error).message);
      setTimeout(() => setState("idle"), 3500);
    }
  }

  const label =
    state === "sending"
      ? "отправляю…"
      : state === "sent"
        ? "отправлено ✓"
        : state === "error"
          ? error ?? "ошибка"
          : "🔔 пингануть всех сейчас";

  return (
    <Button
      fullWidth
      variant={state === "sent" ? "secondary" : "primary"}
      loading={state === "sending"}
      disabled={state !== "idle" && state !== "error"}
      onClick={send}
    >
      {label}
    </Button>
  );
}
