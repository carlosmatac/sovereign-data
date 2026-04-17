"use client"

/**
 * SectionChip — the small pill used for filters, tags, and type indicators.
 *
 * Visual role:
 *   Lives inside toolbars and card headers. Two patterns in production:
 *
 *     1. Neutral tag       — rgba(147,147,147,…) background + border
 *     2. Colored filter    — accent hex at alpha 0.18 bg + 0.50 border
 *
 *   The colored variant supports an ON/OFF state for filter toggles. When
 *   OFF, the chip flips to the neutral pattern.
 *
 * Anatomy:
 *   ┌─────────────────────┐
 *   │ ● Person            │
 *   └─────────────────────┘
 *
 * Do not change the tonal ramp (bg 18%, border 50%, fg 80%) — it is how the
 * accent colors stay visible on the dark surfaces without being loud.
 */

import * as React from "react"

export type ChipTone = "neutral" | "ghost" | "accent"

export interface SectionChipProps {
  tone?: ChipTone
  /** Accent color — only used with `tone="accent"`. */
  color?: string
  /** Show the leading status dot. */
  dot?: boolean
  /** For accent chips: whether the filter is currently on. */
  active?: boolean
  /** Makes the chip interactive. */
  onClick?: () => void
  children: React.ReactNode
}

export function SectionChip({
  tone = "neutral",
  color,
  dot = false,
  active = true,
  onClick,
  children,
}: SectionChipProps) {
  const isButton = typeof onClick === "function"

  let background: string
  let border: string
  let fg: string
  let dotColor: string

  if (tone === "accent" && color) {
    background = active ? `${color}18` : "rgba(255,255,255,0.03)"
    border = active ? `${color}50` : "rgba(147,147,147,0.18)"
    fg = active ? `${color}CC` : "rgba(147,147,147,0.50)"
    dotColor = active ? color : "rgba(147,147,147,0.40)"
  } else if (tone === "ghost") {
    background = "rgba(255,255,255,0.035)"
    border = "rgba(147,147,147,0.12)"
    fg = "rgba(255,255,255,0.42)"
    dotColor = "rgba(147,147,147,0.40)"
  } else {
    background = "rgba(147,147,147,0.18)"
    border = "transparent"
    fg = "rgba(255,255,255,0.65)"
    dotColor = color ?? "rgba(147,147,147,0.55)"
  }

  const classes =
    "inline-flex items-center gap-[4px] rounded-full px-[7px] py-[3.5px] transition-all duration-150"
  const style: React.CSSProperties = {
    background,
    border: border === "transparent" ? "none" : `1px solid ${border}`,
  }

  const content = (
    <>
      {dot && (
        <span
          className="h-[5px] w-[5px] shrink-0 rounded-full"
          style={{ background: dotColor }}
        />
      )}
      <span
        className="text-[7.5px] font-medium"
        style={{ color: fg }}
      >
        {children}
      </span>
    </>
  )

  if (isButton) {
    return (
      <button type="button" onClick={onClick} className={classes} style={style}>
        {content}
      </button>
    )
  }

  return (
    <span className={classes} style={style}>
      {content}
    </span>
  )
}
