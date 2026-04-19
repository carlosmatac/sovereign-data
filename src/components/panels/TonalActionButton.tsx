"use client";

import * as React from "react";
import Link from "next/link";

/**
 * TonalActionButton — Sovereign primary action.
 *
 * The single CTA visual language used for top-of-page primary actions
 * (Upload Interview, New Project, View Projects, New Chat, …).
 *
 * Locks the recipe documented in `docs/ui-panel-system.md` §6 (accents):
 *
 *   bg @ 0.09  →  bg @ 0.14   on hover
 *   border @ 0.24  →  border @ 0.34   on hover
 *   text @ 0.85 (#9CC2F8)  →  text white   on hover
 *   inner icon well: bg @ 0.13  →  bg @ 0.20   on hover
 *   icon color: #5B9CF6  →  #7FB1F8   on hover
 *
 * Resting + hover paints are intentional Tailwind utilities — not inline
 * `style={{ ... }}` — so the `:hover` rules can win the cascade. (The
 * MetricCard regression earlier this week was caused by inline styles
 * outranking the `:hover` utility.)
 *
 * Use this component instead of the shadcn `<Button>` for every primary
 * page-level CTA. It provides a single shared visual treatment so the
 * product reads as one system across pages, not a collection of
 * page-by-page custom buttons.
 */

export interface TonalActionButtonProps {
  /** Renders as a Next.js Link when provided. Otherwise renders a button. */
  href?: string;
  /** Click handler when used as a button. */
  onClick?: () => void;
  /** Optional leading icon (e.g. `<Upload />`). Will be wrapped in the icon well. */
  icon?: React.ReactNode;
  /** Visible label. */
  children: React.ReactNode;
  /** Optional extra classes (rare — prefer to keep treatment uniform). */
  className?: string;
  /** Disabled state — only meaningful when used as a button. */
  disabled?: boolean;
  /** Native button type. Defaults to "button" when not used as a Link. */
  type?: "button" | "submit" | "reset";
}

const BTN_CLS = [
  "group",
  "inline-flex shrink-0 items-center gap-2",
  "rounded-[5px] border",
  "border-[rgba(91,156,246,0.24)] bg-[rgba(91,156,246,0.09)]",
  "px-3.5 py-2",
  "text-[12.5px] font-semibold text-[#9CC2F8]",
  "transition-colors duration-150",
  "hover:border-[rgba(91,156,246,0.34)] hover:bg-[rgba(91,156,246,0.14)] hover:text-white",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,156,246,0.55)]",
  "disabled:cursor-not-allowed disabled:opacity-55",
].join(" ");

const ICON_WELL_CLS = [
  "flex h-[20px] w-[20px] items-center justify-center rounded-[4px]",
  "bg-[rgba(91,156,246,0.13)] text-[#5B9CF6]",
  "transition-colors duration-150",
  "group-hover:bg-[rgba(91,156,246,0.20)] group-hover:text-[#7FB1F8]",
].join(" ");

export function TonalActionButton({
  href,
  onClick,
  icon,
  children,
  className = "",
  disabled,
  type,
}: TonalActionButtonProps) {
  const cls = className ? `${BTN_CLS} ${className}` : BTN_CLS;

  const inner = (
    <>
      {icon ? (
        <span aria-hidden className={ICON_WELL_CLS}>
          {icon}
        </span>
      ) : null}
      {children}
    </>
  );

  if (href) {
    // Link cannot be disabled natively; we soften it visually if asked.
    return (
      <Link
        href={href}
        className={
          disabled
            ? `${cls} pointer-events-none opacity-55`
            : cls
        }
        aria-disabled={disabled || undefined}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      className={cls}
    >
      {inner}
    </button>
  );
}
