"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { api } from "@/lib/api";
import { fmtDayLong } from "@/lib/format";
import { addDays, todayMSK, type DayStatus } from "@/lib/schedule";

type View = {
  user_id: number;
  name: string;
  username: string | null;
  photo_url: string | null;
  label: string | null;
  status: DayStatus;
};

type StatusResponse = {
  date: string;
  views: View[];
  next_common_off: string | null;
};

const STATUS_META: Record<DayStatus, { emoji: string; title: string; order: number }> = {
  work: { emoji: "🏃", title: "работают", order: 0 },
  rest: { emoji: "👀", title: "отдыхают", order: 1 },
  vacation: { emoji: "🏖", title: "в отпуске", order: 2 },
  holiday: { emoji: "🎉", title: "праздник", order: 3 },
  unemployed: { emoji: "😎", title: "безработные", order: 4 },
};

export default function StatusPage() {
  const { auth } = useTg();
  const [date, setDate] = useState(todayMSK());
  const [data, setData] = useState<StatusResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (auth.status !== "ready") return;
    setLoading(true);
    api
      .get<StatusResponse>(`/api/status?date=${date}`)
      .then(setData)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [auth.status, date]);

  const grouped = groupByStatus(data?.views ?? []);

  return (
    <Shell title="кто сегодня">
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(addDays(date, -1))}
            className="px-3 py-1.5 rounded-lg bg-[var(--tg-secbg)] text-sm"
          >
            ‹
          </button>
          <div className="flex-1 text-center font-medium">{fmtDayLong(date)}</div>
          <button
            onClick={() => setDate(addDays(date, 1))}
            className="px-3 py-1.5 rounded-lg bg-[var(--tg-secbg)] text-sm"
          >
            ›
          </button>
        </div>

        {date !== todayMSK() && (
          <button
            onClick={() => setDate(todayMSK())}
            className="text-sm text-link"
          >
            вернуться к сегодня
          </button>
        )}

        {err && <div className="text-red-500 text-sm">{err}</div>}
        {loading && !data && <div className="text-hint text-sm">загружаю…</div>}

        {data && data.views.length === 0 && (
          <div className="text-hint">
            пока никого, добавь меня в группу и нажми /start
          </div>
        )}

        {(Object.keys(grouped) as DayStatus[])
          .sort((a, b) => STATUS_META[a].order - STATUS_META[b].order)
          .map((st) => (
            <section key={st}>
              <div className="text-xs uppercase tracking-wider text-hint mb-1">
                {STATUS_META[st].emoji} {STATUS_META[st].title}
              </div>
              <div className="rounded-xl bg-[var(--tg-secbg)] divide-y divide-[var(--tg-bg)]">
                {grouped[st]!.map((v) => (
                  <div key={v.user_id} className="px-4 py-3 flex items-center gap-3">
                    <Avatar name={v.name} src={v.photo_url} />
                    <div className="flex-1">
                      <div className="font-medium">{v.name}</div>
                      {v.label && <div className="text-hint text-xs">{v.label}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

        {data?.next_common_off && data.next_common_off !== date && (
          <div className="rounded-xl bg-[var(--tg-secbg)] p-4">
            <div className="text-xs uppercase tracking-wider text-hint">
              🚬 общий выходной
            </div>
            <div className="mt-1 font-medium">
              {fmtDayLong(data.next_common_off)}
            </div>
          </div>
        )}
        {data?.next_common_off && data.next_common_off === date && (
          <div className="rounded-xl bg-[var(--tg-secbg)] p-4 text-center">
            🚬 сегодня у всех выходной 🔥
          </div>
        )}
      </div>
    </Shell>
  );
}

function groupByStatus(views: View[]): Partial<Record<DayStatus, View[]>> {
  const out: Partial<Record<DayStatus, View[]>> = {};
  for (const v of views) {
    (out[v.status] ||= []).push(v);
  }
  return out;
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className="w-9 h-9 rounded-full object-cover" />;
  }
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-[var(--tg-bg)] flex items-center justify-center font-semibold">
      {initial}
    </div>
  );
}
