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
          thin ? "var(--sv-border-divider-muted)" : "var(--sv-border-divider-strong)"
        }`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[12.5px] font-semibold leading-tight"
            style={{ color: "var(--sv-text-primary)" }}
          >
            {title}
          </p>
          {subtitle && (
            <p
              className="mt-[3px] text-[10.5px] leading-snug"
              style={{ color: "var(--sv-gray-caption)" }}
            >
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
