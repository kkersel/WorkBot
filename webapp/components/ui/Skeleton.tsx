"use client";

export function Skeleton({ className = "", ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={`relative overflow-hidden bg-[var(--tg-secbg)] rounded-lg ${className}`}
      {...rest}
    >
      <div
        className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite]"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
        }}
      />
    </div>
  );
}
