"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { api } from "@/lib/api";
import { fmtDayLong, fmtDdMmYyyy } from "@/lib/format";
import type { UserSchedule } from "@/lib/schedule";
import { daysFromWeeklyMask, todayMSK } from "@/lib/schedule";
import { RU_WEEKDAYS_SHORT } from "@/lib/format";

type MeResponse = {
  user: { id: number; first_name: string; username: string | null } | null;
  schedule: (UserSchedule & { label: string | null }) | null;
};

function describeSchedule(s: UserSchedule & { label: string | null }): string {
  if (s.type === "cycle" && s.start_date && s.work_days != null && s.rest_days != null) {
    return `${s.work_days}/${s.rest_days} с ${fmtDdMmYyyy(s.start_date)}`;
  }
  if (s.type === "weekly" && s.weekly_mask != null) {
    const days = daysFromWeeklyMask(s.weekly_mask).map((d) => RU_WEEKDAYS_SHORT[d]);
    return days.length ? days.join(", ") : "—";
  }
  if (s.type === "unemployed") return "безработный 😎";
  if (s.type === "custom") return "кастомный";
  return "—";
}

export default function HomePage() {
  const { auth } = useTg();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== "ready") return;
    api.get<MeResponse>("/api/me").then(setMe).catch((e: Error) => setErr(e.message));
  }, [auth.status]);

  const today = todayMSK();

  return (
    <Shell>
      <div className="p-4 space-y-4">
        <div>
          <div className="text-hint text-sm">{fmtDayLong(today)}</div>
          <h1 className="text-2xl font-semibold mt-1">
            {auth.status === "ready" ? `хой, ${auth.user.first_name}` : "хой"} 🍔
          </h1>
        </div>

        <section className="rounded-xl bg-[var(--tg-secbg)] p-4">
          <div className="text-xs uppercase tracking-wider text-hint">мой график</div>
          <div className="mt-1 text-lg font-medium">
            {me?.schedule ? describeSchedule(me.schedule) : err ? "—" : "загружаю…"}
          </div>
          {me?.schedule && (
            <div className="text-hint text-xs mt-1">
              праздники {me.schedule.respect_holidays ? "учитываются" : "игнорируются"}
            </div>
          )}
          <Link
            href="/schedule"
            className="inline-block mt-3 text-sm text-link"
          >
            поменять →
          </Link>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Tile href="/status" icon="👀" label="кто сегодня" hint="командный статус" />
          <Tile href="/calendar" icon="🗓" label="календарь" hint="пометки на день" />
          <Tile href="/vacations" icon="🏖" label="отпуска" hint="добавить / убрать" />
          <Tile href="/gym" icon="💪" label="зал" hint="напоминания" />
        </div>
      </div>
    </Shell>
  );
}

function Tile({ href, icon, label, hint }: { href: string; icon: string; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl bg-[var(--tg-secbg)] p-4 flex flex-col gap-1 active:opacity-70"
    >
      <div className="text-2xl">{icon}</div>
      <div className="font-medium">{label}</div>
      <div className="text-hint text-xs">{hint}</div>
    </Link>
  );
}
