"use client"

/**
 * PanelShell — the outermost dark surface every Sovereign panel lives inside.
 *
 * Visual role:
 *   The rounded, slightly bluish-black rectangle you see behind every feature
 *   panel on the landing page. Gives the whole system its "serious software,
 *   not decorative mockup" feel.
 *
 * Anatomy:
 *   ┌───────────────────────────────────────────────┐
 *   │  (optional) WindowChrome — traffic lights     │
 *   ├───────────────────────────────────────────────┤
 *   │                                               │
 *   │  children                                     │
 *   │                                               │
 *   └───────────────────────────────────────────────┘
 *
 * Never change without a very good reason:
 *   - radius 17px             (signature panel radius)
 *   - bg     #070E1F
 *   - border rgba(147,147,147,0.16)
 *   - shadow is layered (3 stops), not a single `shadow-2xl`
 *
 * Based on:
 *   - components/hero-dashboard-panel.tsx   (variant: "hero")
 *   - components/sales-intelligence-panel.tsx (variant: "copilot")
 *   - components/activate-report-surface.tsx  (variant: "report")
 */

import * as React from "react"

type ShellVariant = "hero" | "copilot" | "report" | "compact"

const SHADOW: Record<ShellVariant, string> = {
  hero:
    "0 0 0 1px rgba(255,255,255,0.05), 0 32px 80px -12px rgba(0,0,0,0.85), 0 8px 32px -4px rgba(0,0,0,0.55)",
  copilot:
    "0 0 0 1px rgba(255,255,255,0.025), 0 36px 80px -16px rgba(0,0,0,0.75), 0 8px 24px -6px rgba(0,0,0,0.55)",
  report:
    "0 0 0 1px rgba(255,255,255,0.025), 0 48px 120px -24px rgba(0,0,0,0.85), 0 8px 24px -6px rgba(0,0,0,0.55)",
  compact:
    "0 0 0 1px rgba(255,255,255,0.025), 0 24px 60px -12px rgba(0,0,0,0.75), 0 6px 20px -4px rgba(0,0,0,0.5)",
}

export interface PanelShellProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Shadow intensity. Default "copilot" is the safe mid-weight shell.
   * Use "hero" for the flagship dashboard, "report" for long documents,
   * "compact" for mobile / inline surfaces.
   */
  variant?: ShellVariant
  /**
   * Force an aspect ratio on the shell (e.g. "880 / 522" for the hero).
   * Leave undefined for height-driven content (chat, reports).
   */
  aspect?: string
  /**
   * Optional radius override. Defaults to the 17px signature panel radius.
   * Use `14` only for compact/mobile variants.
   */
  radius?: 14 | 17
}

export function PanelShell({
  variant = "copilot",
  aspect,
  radius = 17,
  className = "",
  style,
  children,
  ...rest
}: PanelShellProps) {
  return (
    <div
      {...rest}
      className={`relative flex w-full flex-col overflow-hidden ${className}`}
      style={{
        borderRadius: `${radius}px`,
        background: "#070E1F",
        border: "1px solid rgba(147,147,147,0.16)",
        boxShadow: SHADOW[variant],
        aspectRatio: aspect,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
