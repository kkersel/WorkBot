"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { Button } from "@/components/ui/Button";
import { PageTransition } from "@/components/ui/PageTransition";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { fmtDdMmYyyy } from "@/lib/format";
import { todayMSK } from "@/lib/schedule";

type Vacation = {
  id: number;
  start_date: string;
  end_date: string;
  label: string | null;
};

export default function VacationsPage() {
  const { auth, haptic } = useTg();
  const [rows, setRows] = useState<Vacation[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [start, setStart] = useState(todayMSK());
  const [end, setEnd] = useState(todayMSK());
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const r = await api.get<{ vacations: Vacation[] }>("/api/me/vacations");
      setRows(r.vacations);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    if (auth.status === "ready") void load();
  }, [auth.status]);

  async function add() {
    if (end < start) {
      setErr("конец раньше начала");
      return;
    }
    setAdding(true);
    setErr(null);
    try {
      await api.post("/api/me/vacations", {
        start_date: start,
        end_date: end,
        label: label.trim() || null,
      });
      setLabel("");
      haptic("success");
      await load();
    } catch (e) {
      haptic("error");
      setErr((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: number) {
    try {
      await api.del(`/api/me/vacations/${id}`);
      haptic("success");
      await load();
    } catch (e) {
      haptic("error");
      setErr((e as Error).message);
    }
  }

  return (
    <Shell title="отпуска">
      <PageTransition>
        <div className="p-4 space-y-5 pb-6">
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-[var(--tg-secbg)] p-4 space-y-3"
          >
            <div className="text-xs uppercase tracking-wider text-hint">новый отпуск</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-hint">
                с
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full mt-1 bg-[var(--tg-bg)] rounded-lg px-2 py-2"
                />
              </label>
              <label className="text-xs text-hint">
                по
                <input
                  type="date"
                  value={end}
                  min={start}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full mt-1 bg-[var(--tg-bg)] rounded-lg px-2 py-2"
                />
              </label>
            </div>
            <input
              type="text"
              placeholder="подпись (необязательно)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-[var(--tg-bg)] rounded-lg px-3 py-2 text-sm"
            />
            <Button
              fullWidth
              loading={adding}
              onClick={add}
            >
              + добавить
            </Button>
            <AnimatePresence>
              {err && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-red-500 text-xs"
                >
                  {err}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>

          <section>
            <div className="text-xs uppercase tracking-wider text-hint mb-2 px-1">
              мои отпуска
            </div>
            {rows === null ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl bg-[var(--tg-secbg)] p-5 text-center text-hint text-sm">
                пока ни одного — лайф гоес он 😮‍💨
              </div>
            ) : (
              <AnimatePresence>
                <ul className="space-y-2">
                  {rows.map((v) => (
                    <motion.li
                      key={v.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 80 }}
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      className="rounded-2xl bg-[var(--tg-secbg)] px-4 py-3 flex items-center gap-3"
                    >
                      <div className="text-2xl">🏖</div>
                      <div className="flex-1">
                        <div className="font-medium">
                          {fmtDdMmYyyy(v.start_date)} — {fmtDdMmYyyy(v.end_date)}
                        </div>
                        {v.label && (
                          <div className="text-hint text-xs">{v.label}</div>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => remove(v.id)}>
                        удалить
                      </Button>
                    </motion.li>
                  ))}
                </ul>
              </AnimatePresence>
            )}
          </section>
        </div>
      </PageTransition>
    </Shell>
  );
}
