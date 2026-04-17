"use client"

/**
 * InsightCard — the numbered insight card used by the Copilot panel to reveal
 * each reasoning block. Also used by the Output panels as a generic "premium
 * content container".
 *
 * Visual role:
 *   A subtle raised rectangle with a faint-white background, a monospaced
 *   index on the left, a headline in bright white, and a long-form paragraph
 *   in muted gray underneath.
 *
 * Do not change:
 *   - border rgba(147,147,147,0.10)
 *   - bg     rgba(255,255,255,0.024)
 *   - radius 8px
 *   - padding 14px 16px (px-4 py-3.5)
 *   - index  9px / weight 600 / color rgba(255,255,255,0.17)
 *   - headline 12.5px / weight 500 / color white/85 / tracking -0.012em
 *   - body 11px / line-height 1.65 / color #757575
 */

import * as React from "react"

export interface InsightCardProps {
  /** Leading index ("01", "02" …) or custom React node. */
  index?: string | React.ReactNode
  headline: string
  children: React.ReactNode
}

export function InsightCard({ index, headline, children }: InsightCardProps) {
  return (
    <div
      className="rounded-[8px] px-4 py-3.5"
      style={{
        background: "rgba(255,255,255,0.024)",
        border: "1px solid rgba(147,147,147,0.10)",
      }}
    >
      <div className="flex items-start gap-3">
        {index !== undefined && (
          <span
            className="mt-0.5 shrink-0 text-[9px] font-semibold tabular-nums"
            style={{
              letterSpacing: "0.04em",
              color: "rgba(255,255,255,0.17)",
            }}
          >
            {index}
          </span>
        )}
        <div className="min-w-0">
          <p
            className="mb-1.5 text-[12.5px] font-medium leading-snug text-white/85"
            style={{ letterSpacing: "-0.012em" }}
          >
            {headline}
          </p>
          <div
            className="text-[11px] leading-[1.65] text-[#757575]"
            style={{ letterSpacing: "-0.005em" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
