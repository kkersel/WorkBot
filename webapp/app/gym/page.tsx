"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { api } from "@/lib/api";
import { RU_WEEKDAYS_SHORT } from "@/lib/format";

type GymDay = { label?: string; optional?: boolean };
type Plan = {
  user_id: number;
  enabled: boolean;
  days: Record<string, GymDay>;
  evening_poll: boolean;
  poll_hour_msk: number;
};

export default function GymPage() {
  const { auth, haptic } = useTg();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (auth.status !== "ready") return;
    api
      .get<{ plan: Plan }>("/api/me/gym")
      .then((r) => setPlan(r.plan))
      .catch((e: Error) => setErr(e.message));
  }, [auth.status]);

  function toggleDay(i: number) {
    if (!plan) return;
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
    const k = String(i);
    const days = { ...plan.days, [k]: { ...(plan.days[k] ?? {}), optional } };
    setPlan({ ...plan, days });
  }

  async function save() {
    if (!plan) return;
    setSaving(true);
    setErr(null);
    setOk(false);
    try {
      await api.put("/api/me/gym", {
        enabled: plan.enabled,
        days: plan.days,
        evening_poll: plan.evening_poll,
        poll_hour_msk: plan.poll_hour_msk,
      });
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
    <Shell title="зал">
      <div className="p-4 space-y-4">
        {!plan ? (
          <div className="text-hint text-sm">загружаю…</div>
        ) : (
          <>
            <label className="flex items-center justify-between rounded-xl bg-[var(--tg-secbg)] px-4 py-3">
              <div>
                <div className="font-medium">напоминания про зал</div>
                <div className="text-hint text-xs">
                  бот будет спрашивать — идёшь или сливаешь
                </div>
              </div>
              <input
                type="checkbox"
                checked={plan.enabled}
                onChange={(e) => setPlan({ ...plan, enabled: e.target.checked })}
                className="w-5 h-5"
              />
            </label>

            <section className="rounded-xl bg-[var(--tg-secbg)] p-4 space-y-3">
              <div className="text-xs uppercase tracking-wider text-hint">
                дни недели
              </div>
              <div className="grid grid-cols-7 gap-1">
                {RU_WEEKDAYS_SHORT.map((name, i) => {
                  const on = !!plan.days[String(i)];
                  return (
                    <button
                      key={i}
                      onClick={() => toggleDay(i)}
                      className={`py-2 rounded-lg text-sm ${
                        on
                          ? "bg-btn text-btn-fg"
                          : "bg-[var(--tg-bg)] text-hint"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>

              {Object.keys(plan.days)
                .sort()
                .map((k) => {
                  const i = Number(k);
                  const d = plan.days[k];
                  return (
                    <div key={k} className="bg-[var(--tg-bg)] rounded-lg p-3 space-y-2">
                      <div className="text-sm font-medium">
                        {RU_WEEKDAYS_SHORT[i]}
                      </div>
                      <input
                        type="text"
                        placeholder="тема (ноги / спина…) — необязательно"
                        value={d.label ?? ""}
                        onChange={(e) => setLabel(i, e.target.value)}
                        className="w-full bg-[var(--tg-secbg)] rounded px-2 py-1.5 text-sm"
                      />
                      <label className="flex items-center gap-2 text-xs text-hint">
                        <input
                          type="checkbox"
                          checked={!!d.optional}
                          onChange={(e) => setOptional(i, e.target.checked)}
                        />
                        опциональный день (можно слить без стыда)
                      </label>
                    </div>
                  );
                })}
            </section>

            <section className="rounded-xl bg-[var(--tg-secbg)] p-4 space-y-3">
              <label className="flex items-center justify-between">
                <span>вечерний опрос</span>
                <input
                  type="checkbox"
                  checked={plan.evening_poll}
                  onChange={(e) => setPlan({ ...plan, evening_poll: e.target.checked })}
                  className="w-5 h-5"
                />
              </label>
              <label className="flex items-center justify-between">
                <span>во сколько спрашивать (МСК)</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={plan.poll_hour_msk}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      poll_hour_msk: Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-16 bg-[var(--tg-bg)] rounded px-2 py-1 text-center"
                />
              </label>
            </section>

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
