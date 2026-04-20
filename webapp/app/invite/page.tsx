"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { Button } from "@/components/ui/Button";
import { PageTransition } from "@/components/ui/PageTransition";
import { api } from "@/lib/api";

type Place = {
  name: string;
  address: string | null;
  why: string | null;
  price_range: string | null;
  url: string | null;
  phone: string | null;
  emoji: string | null;
};

const KINDS = [
  { v: "бар", emoji: "🍸", label: "бар" },
  { v: "пул", emoji: "🎱", label: "пул" },
  { v: "кофе", emoji: "☕️", label: "кофе" },
  { v: "кино", emoji: "🎬", label: "кино" },
  { v: "кафе", emoji: "🍔", label: "кафе" },
  { v: "боулинг", emoji: "🎳", label: "боулинг" },
  { v: "караоке", emoji: "🎤", label: "караоке" },
  { v: "кальян", emoji: "💨", label: "кальян" },
];

export default function InvitePage() {
  const { auth, haptic, hapticTap, tg } = useTg();
  const [kind, setKind] = useState<string>("бар");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  async function ask() {
    setLoading(true);
    setError(null);
    setPlaces(null);
    try {
      const r = await api.post<{ places: Place[] }>("/api/ai/suggest-places", {
        kind,
        hint: hint.trim() || null,
        count: 3,
      });
      setPlaces(r.places);
      haptic("success");
    } catch (e) {
      haptic("error");
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function sendToGroup(p: Place, i: number) {
    if (auth.status !== "ready") return;
    try {
      await api.post("/api/invite/send", {
        kind,
        inviter_name: auth.user.first_name,
        place: p,
      });
      haptic("success");
      setSent(i);
      setTimeout(() => {
        try { tg?.close(); } catch {}
      }, 900);
    } catch (e) {
      haptic("error");
      setError((e as Error).message);
    }
  }

  const openUrl = (url: string) => {
    try {
      tg?.openLink(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <Shell title="куда пойти?">
      <PageTransition>
        <div className="p-4 space-y-5 pb-6">
          <div className="text-hint text-sm">
            выбери тип, добавь пожелание и ✨ AI предложит места в Москве
          </div>

          {/* Kind picker */}
          <div>
            <div className="text-xs uppercase tracking-wider text-hint mb-2 px-1">тип</div>
            <div className="grid grid-cols-4 gap-2">
              {KINDS.map((k) => (
                <motion.button
                  key={k.v}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => {
                    hapticTap();
                    setKind(k.v);
                  }}
                  className={`rounded-2xl py-3 flex flex-col items-center gap-0.5 transition-colors ${
                    kind === k.v
                      ? "bg-btn text-btn-fg ring-2 ring-[var(--tg-link)]"
                      : "bg-[var(--tg-secbg)]"
                  }`}
                >
                  <div className="text-xl">{k.emoji}</div>
                  <div className="text-[10px]">{k.label}</div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Hint */}
          <div className="space-y-1.5">
            <div className="text-xs uppercase tracking-wider text-hint px-1">
              пожелание (необязательно)
            </div>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) ask();
              }}
              placeholder="«с террасой в центре» / «до 2000 за чел»"
              className="w-full rounded-xl bg-[var(--tg-secbg)] px-4 py-2.5 text-[15px] placeholder:text-hint outline-none focus:ring-2 focus:ring-[var(--tg-link)]"
            />
          </div>

          <Button fullWidth size="lg" loading={loading} onClick={ask}>
            ✨ предложи
          </Button>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-500"
            >
              {error}
            </motion.div>
          )}

          {loading && <ThinkingCards />}

          <AnimatePresence>
            {places && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                {places.map((p, i) => (
                  <PlaceCard
                    key={i}
                    place={p}
                    index={i}
                    sent={sent === i}
                    onSend={() => sendToGroup(p, i)}
                    onOpenUrl={openUrl}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PageTransition>
    </Shell>
  );
}

function PlaceCard({
  place,
  index,
  sent,
  onSend,
  onOpenUrl,
}: {
  place: Place;
  index: number;
  sent: boolean;
  onSend: () => void;
  onOpenUrl: (url: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 300, damping: 28 }}
      className="rounded-2xl bg-[var(--tg-secbg)] p-4 space-y-2.5"
    >
      <div className="flex items-start gap-2">
        <div className="text-2xl mt-0.5">{place.emoji || "📍"}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px]">{place.name}</div>
          {place.address && (
            <div className="text-hint text-xs mt-0.5">{place.address}</div>
          )}
        </div>
        {place.price_range && (
          <div className="text-xs bg-[var(--tg-bg)] px-2 py-1 rounded-lg whitespace-nowrap">
            {place.price_range}
          </div>
        )}
      </div>

      {place.why && (
        <div className="text-sm text-[var(--tg-fg)]/90 leading-snug">
          <span className="text-hint">— </span>
          {place.why}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {place.phone && (
          <a
            href={`tel:${place.phone.replace(/[^+\d]/g, "")}`}
            className="text-xs px-3 py-1.5 bg-[var(--tg-bg)] rounded-full"
          >
            ☎️ {place.phone}
          </a>
        )}
        {place.url && (
          <button
            onClick={() => onOpenUrl(place.url!)}
            className="text-xs px-3 py-1.5 bg-[var(--tg-bg)] rounded-full text-link"
          >
            🔗 подробнее
          </button>
        )}
      </div>

      <Button
        fullWidth
        variant={sent ? "secondary" : "primary"}
        size="md"
        onClick={onSend}
        disabled={sent}
      >
        {sent ? "позвал ✓" : "позвать всех"}
      </Button>
    </motion.div>
  );
}

function ThinkingCards() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="rounded-2xl bg-[var(--tg-secbg)] p-4 flex items-center gap-3"
        >
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
            className="text-2xl"
          >
            🤔
          </motion.div>
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 bg-[var(--tg-bg)] rounded animate-pulse" />
            <div className="h-2 w-1/2 bg-[var(--tg-bg)] rounded animate-pulse" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
