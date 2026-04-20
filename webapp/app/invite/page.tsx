"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { useTg } from "@/components/TgApp";
import { Button } from "@/components/ui/Button";
import { PageTransition } from "@/components/ui/PageTransition";
import { api } from "@/lib/api";

type Place = {
  name: string;
  address: string | null;
  kind: string | null;
  why: string | null;
  price_range: string | null;
  url: string | null;
  phone: string | null;
  emoji: string | null;
  step?: number | null;
};

type AiResponse = {
  reply: string | null;
  places: Place[];
};

type Msg =
  | { role: "user"; text: string }
  | { role: "ai"; reply: string | null; places: Place[]; sent?: number[] };

const EXAMPLES = [
  { icon: "🍸", text: "бар с террасой в центре" },
  { icon: "🎳", text: "сначала боулинг потом пул и бар" },
  { icon: "☕️", text: "тихое кафе для разговоров" },
  { icon: "🎤", text: "караоке на компанию 6 человек" },
  { icon: "💨", text: "хорошая кальянная на Патриках" },
  { icon: "🎬", text: "кино на новинки рядом с метро" },
];

export default function InvitePage() {
  const { auth, haptic, hapticTap, tg } = useTg();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function ask(text?: string) {
    const prompt = (text ?? input).trim();
    if (!prompt || loading) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setLoading(true);
    try {
      const r = await api.post<AiResponse>("/api/ai/suggest-places", { prompt });
      setMessages((m) => [...m, { role: "ai", reply: r.reply, places: r.places ?? [] }]);
      haptic("success");
    } catch (e) {
      haptic("error");
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function sendToGroup(msgIdx: number, placeIdx: number) {
    if (auth.status !== "ready") return;
    const msg = messages[msgIdx];
    if (msg.role !== "ai") return;
    const place = msg.places[placeIdx];
    try {
      const kind = place.kind || "встреча";
      await api.post("/api/invite/send", {
        kind,
        inviter_name: auth.user.first_name,
        place,
      });
      haptic("success");
      setMessages((prev) => {
        const next = [...prev];
        const m = next[msgIdx];
        if (m.role === "ai") {
          const sent = new Set(m.sent ?? []);
          sent.add(placeIdx);
          next[msgIdx] = { ...m, sent: Array.from(sent) };
        }
        return next;
      });
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
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4">
            {messages.length === 0 && <Welcome onExample={(t) => { hapticTap(); ask(t); }} />}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <UserBubble key={i} text={m.text} />
              ) : (
                <AiBubble
                  key={i}
                  reply={m.reply}
                  places={m.places}
                  sent={m.sent ?? []}
                  onSend={(pi) => sendToGroup(i, pi)}
                  onOpenUrl={openUrl}
                />
              ),
            )}

            {loading && <TypingBubble />}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-500 px-2"
              >
                {error}
              </motion.div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="sticky bottom-0 safe-bottom bg-[var(--tg-bg)] border-t border-[var(--tg-secbg)] px-3 py-2">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                rows={1}
                placeholder="опиши что хочется — бар, план на вечер…"
                className="flex-1 resize-none rounded-2xl bg-[var(--tg-secbg)] px-4 py-2.5 text-[15px] max-h-32 placeholder:text-hint outline-none focus:ring-2 focus:ring-[var(--tg-link)]"
                style={{ minHeight: 44 }}
              />
              <Button
                size="md"
                loading={loading}
                disabled={!input.trim() || loading}
                onClick={() => ask()}
                className="shrink-0"
              >
                ✨
              </Button>
            </div>
          </div>
        </div>
      </PageTransition>
    </Shell>
  );
}

function Welcome({ onExample }: { onExample: (text: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="rounded-2xl bg-[var(--tg-secbg)] p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">🍔</span>
          <span className="font-semibold">шокобургер</span>
        </div>
        <div className="text-sm text-[var(--tg-fg)]/90 leading-snug">
          опиши куда хочется — подберу место или распишу план на вечер.
          можно просто «бар», можно «сначала боулинг потом пул и бар».
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-hint mb-2 px-1">
          примеры
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onExample(e.text)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[var(--tg-secbg)] text-sm"
            >
              <span>{e.icon}</span>
              <span>{e.text}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className="flex justify-end"
    >
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-btn text-btn-fg px-4 py-2 text-[15px] leading-snug whitespace-pre-wrap">
        {text}
      </div>
    </motion.div>
  );
}

function AiBubble({
  reply,
  places,
  sent,
  onSend,
  onOpenUrl,
}: {
  reply: string | null;
  places: Place[];
  sent: number[];
  onSend: (placeIdx: number) => void;
  onOpenUrl: (url: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-2"
    >
      {reply && (
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--tg-link)] to-purple-500 text-white flex items-center justify-center text-lg shrink-0">
            🍔
          </div>
          <div className="flex-1 rounded-2xl rounded-tl-sm bg-[var(--tg-secbg)] px-4 py-2 text-[15px] leading-snug max-w-[85%]">
            {reply}
          </div>
        </div>
      )}
      {places.length > 0 && (
        <div className="space-y-2 pl-10">
          {places.map((p, i) => (
            <PlaceCard
              key={i}
              place={p}
              index={i}
              sent={sent.includes(i)}
              onSend={() => onSend(i)}
              onOpenUrl={onOpenUrl}
            />
          ))}
        </div>
      )}
    </motion.div>
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
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 320, damping: 28 }}
      className="rounded-2xl bg-[var(--tg-secbg)] p-3.5 space-y-2"
    >
      <div className="flex items-start gap-2">
        <div className="text-2xl shrink-0 mt-0.5 relative">
          {place.emoji || "📍"}
          {place.step != null && (
            <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-[var(--tg-link)] text-[9px] text-white font-bold flex items-center justify-center">
              {place.step}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px]">{place.name}</div>
          {place.address && (
            <div className="text-hint text-xs mt-0.5">{place.address}</div>
          )}
        </div>
        {place.price_range && (
          <div className="text-[10px] bg-[var(--tg-bg)] px-2 py-1 rounded-lg whitespace-nowrap">
            {place.price_range}
          </div>
        )}
      </div>

      {place.why && (
        <div className="text-[13px] text-[var(--tg-fg)]/90 leading-snug">
          <span className="text-hint">— </span>
          {place.why}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 items-center">
        {place.phone && (
          <a
            href={`tel:${place.phone.replace(/[^+\d]/g, "")}`}
            className="text-xs px-2.5 py-1 bg-[var(--tg-bg)] rounded-full"
          >
            ☎️ позвонить
          </a>
        )}
        {place.url && (
          <button
            onClick={() => onOpenUrl(place.url!)}
            className="text-xs px-2.5 py-1 bg-[var(--tg-bg)] rounded-full text-link"
          >
            🔗 подробнее
          </button>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant={sent ? "secondary" : "primary"}
          onClick={onSend}
          disabled={sent}
        >
          {sent ? "позвал ✓" : "позвать всех"}
        </Button>
      </div>
    </motion.div>
  );
}

function TypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--tg-link)] to-purple-500 text-white flex items-center justify-center text-lg shrink-0">
        🍔
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-[var(--tg-secbg)] px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12 }}
            className="w-1.5 h-1.5 rounded-full bg-hint"
          />
        ))}
      </div>
    </motion.div>
  );
}
