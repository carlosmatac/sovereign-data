"use client"

/**
 * PanelHeader — the section heading strip used inside every inner panel.
 *
 * NOTE (app vs landing):
 *   The landing ships this at 10px title / 8px subtitle / `px-4 py-2.5` —
 *   those values make the panels read like compressed product screenshots.
 *   In the real product we bump by +2–3px so section headers stay legible
 *   in a full-height viewport without losing the dense, editorial rhythm.
 */

import * as React from "react"

export interface PanelHeaderProps {
  title: string
  subtitle?: string
  /** Right-side content — usually action buttons or a meta string. */
  right?: React.ReactNode
  /**
   * If true, uses a thinner bottom border. Use inside toolbars / multi-line
   * stacked headers so the rhythm stays balanced.
   */
  thin?: boolean
}

export function PanelHeader({
  title,
  subtitle,
  right,
  thin = false,
}: PanelHeaderProps) {
  return (
    <div
      className="px-4 py-3"
      style={{
        borderBottom: `1px solid ${
          thin ? "rgba(147,147,147,0.10)" : "rgba(147,147,147,0.14)"
        }`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold leading-tight text-white">
            {title}
          </p>
          {subtitle && (
            <p className="mt-[3px] text-[10.5px] leading-snug text-[#8a8a8a]">
              {subtitle}
            </p>
          )}
        </div>
        {right && (
          <div className="flex shrink-0 items-center gap-2">{right}</div>
        )}
      </div>
    </div>
  )
}
