"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef, type ReactNode } from "react";
import { useTg } from "../TgApp";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  haptic?: boolean;
  children: ReactNode;
};

const variants: Record<Variant, string> = {
  primary: "bg-btn text-btn-fg shadow-sm",
  secondary: "bg-[var(--tg-secbg)] text-[var(--tg-fg)]",
  ghost: "bg-transparent text-link",
  danger: "bg-red-500/90 text-white",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2.5 text-[15px] rounded-xl",
  lg: "px-5 py-3.5 text-base font-semibold rounded-2xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    fullWidth,
    loading,
    haptic = true,
    disabled,
    className = "",
    children,
    onClick,
    ...rest
  },
  ref,
) {
  const { hapticTap } = useTg();
  const isDisabled = disabled || loading;

  return (
    <motion.button
      ref={ref}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={(e) => {
        if (!isDisabled && haptic) hapticTap();
        onClick?.(e);
      }}
      className={`relative ${variants[variant]} ${sizes[size]} ${
        fullWidth ? "w-full" : ""
      } inline-flex items-center justify-center gap-2 select-none ${
        isDisabled ? "opacity-60" : "active:opacity-90"
      } ${className}`}
      {...rest}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
      <span className={loading ? "opacity-0" : "opacity-100"}>{children}</span>
    </motion.button>
  );
});

function Spinner() {
  return (
    <svg
      className="w-5 h-5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-90"
      />
    </svg>
  );
}
