"use client"

/**
 * WindowChrome — the top bar that sits at the head of every Sovereign panel.
 *
 * Visual role:
 *   A familiar macOS-style window header that immediately signals "this is a
 *   real application, not a marketing mockup". Traffic-light dots, an uppercase
 *   label, an optional status pill on the right.
 *
 *   This single component unifies the visual language across:
 *     - Hero dashboard shell
 *     - Copilot panel
 *     - Interview detail background
 *     - Report surface
 *     - Mobile interviews panel
 *
 * Anatomy:
 *   ● ● ●   SOVEREIGN · COPILOT                          [● LIVE]
 *
 * Exact values taken from the production code. Do not alter:
 *   - dot size 8px (desktop) / 9px (mobile)
 *   - dot alpha 0.42 across all three colors
 *   - label uppercase, tracking 0.07em, color rgba(255,255,255,0.28)
 *   - gradient is top-to-bottom #0D1B32 → #0B1729
 *   - bottom border rgba(147,147,147,0.10)
 */

import * as React from "react"

export type ChromeDensity = "desktop" | "mobile"

type StatusTone = "live" | "ready" | "draft" | "confidential" | "off"

const STATUS_STYLES: Record<
  StatusTone,
  { bg: string; border: string; dot: string; fg: string }
> = {
  live: {
    bg: "rgba(74,222,128,0.07)",
    border: "rgba(74,222,128,0.17)",
    dot: "#4ADE80",
    fg: "#4ADE80",
  },
  ready: {
    bg: "rgba(74,222,128,0.07)",
    border: "rgba(74,222,128,0.17)",
    dot: "#4ADE80",
    fg: "#4ADE80",
  },
  draft: {
    bg: "rgba(251,191,36,0.07)",
    border: "rgba(251,191,36,0.18)",
    dot: "#FBBF24",
    fg: "#FBBF24",
  },
  confidential: {
    bg: "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.22)",
    dot: "#F87171",
    fg: "rgba(239,68,68,0.80)",
  },
  off: {
    bg: "rgba(255,255,255,0.03)",
    border: "rgba(147,147,147,0.18)",
    dot: "rgba(147,147,147,0.40)",
    fg: "rgba(255,255,255,0.32)",
  },
}

export interface WindowChromeProps {
  /** Label rendered next to the traffic-light dots. e.g. "Sovereign · Copilot". */
  label: string
  /** Optional right-side status pill. Omit to hide. */
  status?: { tone: StatusTone; text: string }
  /** Controls dot size (8px desktop / 9px mobile) and chrome padding. */
  density?: ChromeDensity
  /** Replace the right-side content entirely (overrides `status`). */
  right?: React.ReactNode
}

export function WindowChrome({
  label,
  status,
  density = "desktop",
  right,
}: WindowChromeProps) {
  const dotSize = density === "mobile" ? 9 : 8
  const labelSize = density === "mobile" ? 11 : 10
  const padY = density === "mobile" ? 12 : 9

  return (
    <div
      className="flex shrink-0 items-center justify-between"
      style={{
        padding: `${padY}px 16px`,
        background: "linear-gradient(to bottom, #0D1B32, #0B1729)",
        borderBottom: "1px solid rgba(147,147,147,0.10)",
      }}
    >
      <div className="flex items-center gap-3">
        {/* Traffic-light dots */}
        <div className="flex gap-[5px]">
          {(
            [
              "rgba(255,95,86,0.42)",
              "rgba(255,189,68,0.42)",
              "rgba(40,200,64,0.42)",
            ] as const
          ).map((color, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: `${dotSize}px`,
                height: `${dotSize}px`,
                background: color,
              }}
            />
          ))}
        </div>
        <span
          className="font-medium uppercase"
          style={{
            fontSize: `${labelSize}px`,
            letterSpacing: "0.07em",
            color: "rgba(255,255,255,0.28)",
          }}
        >
          {label}
        </span>
      </div>
      {right !== undefined ? right : status ? <StatusPill {...status} /> : null}
    </div>
  )
}

/**
 * StatusPill — small "Live" / "Ready" / "Confidential" indicator. Exported
 * separately so you can use it anywhere (it also appears inline in card
 * headers, not only in the window chrome).
 */
export function StatusPill({ tone, text }: { tone: StatusTone; text: string }) {
  const s = STATUS_STYLES[tone]
  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2 py-[3px]"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      <div
        className="h-[5px] w-[5px] rounded-full"
        style={{ background: s.dot }}
      />
      <span
        className="font-semibold uppercase"
        style={{
          fontSize: "8.5px",
          letterSpacing: "0.09em",
          color: s.fg,
        }}
      >
        {text}
      </span>
    </div>
  )
}
