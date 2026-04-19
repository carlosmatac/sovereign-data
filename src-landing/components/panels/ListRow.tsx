"use client"

/**
 * ListRow — the dense "one entity per row" pattern used for interviews,
 * communications, recent activity, deals and sources.
 *
 * Visual role:
 *   A card-shaped row with a leading circular icon well, a two-line body
 *   (primary + secondary), and a right-aligned meta area. It's the workhorse
 *   of every list-style surface in the Sovereign panels.
 *
 * Do not change:
 *   - row border rgba(147,147,147,0.15), hover 0.30
 *   - hover background white/[0.025]
 *   - icon well 22×22px, rounded-full, tinted
 *   - primary text 9.5px weight 600
 *   - secondary text 8px color #686868
 *   - horizontal padding px-3, inner gap 2.5
 */

import * as React from "react"

export interface ListRowProps {
  /** Leading icon well content. Typically a tinted <Icon> inside. */
  leading?: React.ReactNode
  /** Primary (bold, white) label. */
  title: string
  /** Optional secondary caption rendered below. */
  caption?: React.ReactNode
  /** Right-aligned meta slot — duration, badges, etc. */
  trailing?: React.ReactNode
  onClick?: () => void
}

export function ListRow({
  leading,
  title,
  caption,
  trailing,
  onClick,
}: ListRowProps) {
  return (
    <div
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-2.5 rounded-[5px] border px-3 transition-all duration-150 hover:border-[rgba(147,147,147,0.30)] hover:bg-white/[0.025]"
      style={{
        minHeight: 42,
        borderColor: "rgba(147,147,147,0.15)",
      }}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[9.5px] font-semibold leading-none text-white">
          {title}
        </p>
        {caption && (
          <p className="mt-[3px] truncate text-[8px] leading-none text-[#686868]">
            {caption}
          </p>
        )}
      </div>
      {trailing && (
        <div className="flex shrink-0 items-center gap-[10px]">{trailing}</div>
      )}
    </div>
  )
}

/**
 * IconWell — the circular / rounded tinted container behind a leading icon.
 *
 * Standard size is 22×22 (list rows). Pass size={18} for compact wells inside
 * dashboard chips, or size={32} for mobile list rows.
 */
export function IconWell({
  children,
  accent = "#4E5CD2",
  size = 22,
  shape = "circle",
}: {
  children: React.ReactNode
  accent?: string
  size?: number
  shape?: "circle" | "square"
}) {
  // Parse hex to rgb for tonal bg/border
  const { r, g, b } = hexToRgb(accent)
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: shape === "circle" ? "9999px" : "3px",
        background: `rgba(${r},${g},${b},0.13)`,
        border: `1px solid rgba(${r},${g},${b},0.28)`,
      }}
    >
      {children}
    </div>
  )
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace("#", "")
  const v =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  }
}
