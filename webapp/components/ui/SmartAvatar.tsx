"use client";

import { useState } from "react";

/**
 * Graceful avatar: prefers Telegram's `photo_url` from initData (already in DB);
 * if null or fails to load, falls back to our /api/avatar/<id> proxy that hits
 * Telegram Bot API to fetch the user's profile picture; if that also fails,
 * shows a gradient circle with the first letter.
 */
export function SmartAvatar({
  userId,
  name,
  src,
  size = 32,
  ringClass = "",
  className = "",
}: {
  userId: number;
  name: string;
  src: string | null | undefined;
  size?: number;
  ringClass?: string;
  className?: string;
}) {
  const [stage, setStage] = useState<"primary" | "proxy" | "fallback">(
    src ? "primary" : "proxy",
  );
  const initial = name.slice(0, 1).toUpperCase();

  const commonImgClass = `rounded-full object-cover border border-[var(--tg-bg)] ${ringClass} ${className}`;
  const style = { width: size, height: size };

  if (stage === "fallback") {
    return (
      <div
        style={{ ...style, fontSize: size * 0.46 }}
        className={`rounded-full bg-gradient-to-br from-[var(--tg-link)] to-purple-500 text-white font-semibold flex items-center justify-center border border-[var(--tg-bg)] ${ringClass} ${className}`}
      >
        {initial}
      </div>
    );
  }

  const url = stage === "primary" ? src! : `/api/avatar/${userId}`;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      style={style}
      className={commonImgClass}
      onError={() => setStage((s) => (s === "primary" ? "proxy" : "fallback"))}
    />
  );
}
