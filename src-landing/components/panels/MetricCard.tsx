"use client"

/**
 * MetricCard — the KPI block used at the top of Dashboard and Project views.
 *
 * Visual role:
 *   Compact card with:
 *     - tiny uppercase LABEL on the left
 *     - a small tinted icon well on the right
 *     - a large bold numerical VALUE
 *     - a single-line tertiary SUB description
 *
 * Two density variants:
 *   - "compact" (18px value)  → hero-dashboard KPI cards
 *   - "large"   (22px value)  → project-dashboard headline KPIs
 *
 * Do not change:
 *   - label size 7.5px / weight 600 / uppercase / tracking 0.07em
 *     (large variant bumps to 9.5px / 0.09em)
 *   - sub size 7.5px (compact) / 9.5px (large)
 *   - icon well 18×18px, radius 3px, bg `${color}22`
 *   - border rgba(147,147,147,0.15), hover 0.32
 */

import * as React from "react"
import type { LucideIcon } from "lucide-react"

export interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
  /** Optional icon rendered inside a tinted 18×18 well (compact variant). */
  icon?: LucideIcon
  /** Accent color for the icon well and optional value tint. */
  accent?: string
  /** Density. `compact` = hero KPI cards, `large` = project headline KPIs. */
  size?: "compact" | "large"
  /** Color the value with the accent (used for positive/negative numbers). */
  tintValue?: boolean
}

export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  size = "compact",
  tintValue = false,
}: MetricCardProps) {
  const isLarge = size === "large"
  const valueColor = tintValue && accent ? accent : "#fff"

  return (
    <div
      className={
        isLarge
          ? "flex flex-col gap-1 rounded-xl p-4"
          : "cursor-pointer rounded-[5px] border px-3 py-2.5 transition-all duration-150 hover:border-[rgba(147,147,147,0.32)] hover:bg-white/[0.03]"
      }
      style={
        isLarge
          ? {
              background: "#080F1E",
              border: "1px solid rgba(147,147,147,0.13)",
            }
          : {
              borderColor: "rgba(147,147,147,0.15)",
            }
      }
    >
      {isLarge ? (
        <>
          <p
            className="text-[9.5px] font-semibold uppercase"
            style={{
              letterSpacing: "0.09em",
              color: "rgba(255,255,255,0.28)",
            }}
          >
            {label}
          </p>
          <p
            className="text-[22px] font-semibold tabular-nums leading-none"
            style={{ color: valueColor, letterSpacing: "-0.020em" }}
          >
            {value}
          </p>
          {sub && (
            <p
              className="text-[9.5px]"
              style={{ color: "rgba(255,255,255,0.22)" }}
            >
              {sub}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mb-[7px] flex items-center justify-between">
            <span
              className="text-[7.5px] font-semibold uppercase tracking-[0.07em]"
              style={{ color: "#555" }}
            >
              {label}
            </span>
            {Icon && (
              <div
                className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px]"
                style={{ background: `${accent ?? "#5B9CF6"}22` }}
              >
                <Icon
                  className="shrink-0"
                  style={{ width: "9px", height: "9px", color: accent }}
                  strokeWidth={1.5}
                />
              </div>
            )}
          </div>
          <p className="text-[18px] font-bold leading-none text-white">
            {value}
          </p>
          {sub && (
            <p className="mt-[5px] text-[7.5px] text-[#5a5a5a]">{sub}</p>
          )}
        </>
      )}
    </div>
  )
}
