"use client"

/**
 * MetricCard — the KPI block used at the top of Dashboard and Project views.
 *
 * Compact   → dashboard KPI row
 * Large     → project-level headline KPIs
 *
 * NOTE (app vs landing):
 *   Landing renders compact values at 18px / sub at 7.5px to emulate a
 *   screenshot-density panel. In the real app we bump to 22px / 10.5px so
 *   numeric KPIs read as a product headline rather than a preview scale.
 */

import * as React from "react"

export interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
  /**
   * Optional icon rendered inside a tinted icon well (compact variant).
   *
   * Pass a pre-rendered node (e.g. `<FolderKanban className="h-3 w-3" />`)
   * rather than a component type — component references cannot cross the
   * React Server → Client boundary in Next.js App Router.
   */
  icon?: React.ReactNode
  /** Accent color for the icon well and optional value tint. */
  accent?: string
  /** Density. `compact` = dashboard KPI cards, `large` = project headline KPIs. */
  size?: "compact" | "large"
  /** Color the value with the accent (used for positive/negative numbers). */
  tintValue?: boolean
}

export function MetricCard({
  label,
  value,
  sub,
  icon,
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
          ? "flex flex-col gap-1.5 rounded-[6px] p-4"
          : "rounded-[6px] border px-4 py-3.5 transition-all duration-150 hover:border-[rgba(147,147,147,0.28)] hover:bg-white/[0.02]"
      }
      style={
        isLarge
          ? {
              background: "#080F1E",
              border: "1px solid rgba(147,147,147,0.13)",
            }
          : {
              background: "#080F1E",
              borderColor: "rgba(147,147,147,0.15)",
            }
      }
    >
      {isLarge ? (
        <>
          <p
            className="text-[10.5px] font-semibold uppercase"
            style={{
              letterSpacing: "0.09em",
              color: "rgba(255,255,255,0.42)",
            }}
          >
            {label}
          </p>
          <p
            className="text-[28px] font-semibold tabular-nums leading-none"
            style={{ color: valueColor, letterSpacing: "-0.020em" }}
          >
            {value}
          </p>
          {sub && (
            <p
              className="text-[11px]"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              {sub}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.07em]"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              {label}
            </span>
            {icon && (
              <div
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px]"
                style={{
                  background: `${accent ?? "#5B9CF6"}22`,
                  color: accent,
                }}
              >
                {icon}
              </div>
            )}
          </div>
          <p className="text-[22px] font-semibold tabular-nums leading-none text-white">
            {value}
          </p>
          {sub && (
            <p className="mt-[6px] text-[10.5px] text-white/45">{sub}</p>
          )}
        </>
      )}
    </div>
  )
}
