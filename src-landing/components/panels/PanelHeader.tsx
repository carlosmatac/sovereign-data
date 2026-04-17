"use client"

/**
 * PanelHeader — the section heading strip used inside every inner panel.
 *
 * Visual role:
 *   A 1-line title, optional 2-line subtitle, and an optional right-side slot
 *   for actions or metadata. Sits directly under the WindowChrome (outer) or
 *   at the top of an inner central panel (when nested inside AppSurface).
 *
 * Anatomy:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Title                                         (right slot)  │
 *   │  Subtitle — small gray caption                               │
 *   └──────────────────────────────────────────────────────────────┘
 *   ── rgba(147,147,147,0.14) bottom border
 *
 * Do not change:
 *   - title font-size 10px / weight 600 / color #fff
 *   - subtitle font-size 8px / line-height snug / color #777
 *   - top/bottom padding 10px / horizontal 16px
 *   - bottom border rgba(147,147,147,0.14)
 *
 * Based on the header pattern in:
 *   - DashboardPanel
 *   - ProjectsPanel
 *   - InterviewsPanel
 *   - NetworkExplorerPanel
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
      className="px-4 py-2.5"
      style={{
        borderBottom: `1px solid ${
          thin ? "rgba(147,147,147,0.10)" : "rgba(147,147,147,0.14)"
        }`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-white">{title}</p>
          {subtitle && (
            <p className="mt-[2px] text-[8px] leading-snug text-[#777]">
              {subtitle}
            </p>
          )}
        </div>
        {right && <div className="flex shrink-0 items-center gap-[6px]">{right}</div>}
      </div>
    </div>
  )
}
