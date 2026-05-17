"use client";

import * as React from "react";
import { PanelHeader, type PanelHeaderProps } from "./PanelHeader";

/**
 * SectionSurface — the "inner panel" used inside a route page.
 *
 * Visual role:
 *   A mid-weight surface that sits on top of the app canvas (`#070E1F`) and
 *   carries a single section of the product: a KPI row, a chart, a table, a
 *   list, etc. Uses the nested surface tint (`#080F1E`) with a soft border
 *   and a 6px radius — the same values the landing uses for its detail wells.
 *
 *   This is not the signature 17px outer shell (`PanelShell`) — that one is
 *   reserved for the app frame and for "screenshot-like" panels (report,
 *   copilot, hero dashboard).
 *
 * Usage:
 *   <SectionSurface header={{ title: "Recent Interviews", subtitle: "Latest uploaded recordings", right: <Link … /> }}>
 *     {children}
 *   </SectionSurface>
 */
/**
 * Tone controls the surface elevation in the 3-level hierarchy.
 *
 * April 2026 polish pass — surface tones desaturated from the previous
 * SaaS-blue family to graphite/near-black with subtle cool undertone:
 *
 *   • `default` — `#0B0E14` / border 0.13. Use when the surface sits
 *     directly on the outer shell (`#08090E`), i.e. on most route
 *     pages. Matches the new workspace tone exactly.
 *   • `lifted`  — `#0E1119` / border 0.16. Use when the surface sits on
 *     the workspace canvas (`#0B0E14`) and needs to read as one tonal
 *     step above it. The dashboard uses this so the chain reads as
 *     sidebar (deepest) → workspace → card → inner well (recessed).
 *   • `well`    — `#07080C` / border 0.10. Use for *recessed* inner
 *     regions (chart container, status interior) inside a `lifted`
 *     card.
 */
export type SectionSurfaceTone = "default" | "lifted" | "well";

const TONE_STYLES: Record<
  SectionSurfaceTone,
  { background: string; borderColor: string }
> = {
  default: {
    background: "var(--sv-surface-bg)",
    borderColor: "var(--sv-border-divider-soft)",
  },
  lifted: {
    background: "var(--sv-surface-bg)",
    borderColor: "var(--sv-border-panel)",
  },
  well: {
    background: "var(--sv-canvas-bg)",
    borderColor: "var(--sv-border-divider-muted)",
  },
};

export interface SectionSurfaceProps {
  header?: PanelHeaderProps;
  /** Padding applied to the body (between the header and the bottom edge). */
  bodyClassName?: string;
  /** Additional class names on the outer surface. */
  className?: string;
  /** Surface elevation tone. Defaults to `default`. */
  tone?: SectionSurfaceTone;
  children: React.ReactNode;
}

export function SectionSurface({
  header,
  bodyClassName = "p-4",
  className = "",
  tone = "default",
  children,
}: SectionSurfaceProps) {
  const t = TONE_STYLES[tone];
  return (
    <div
      className={`overflow-hidden rounded-[6px] ${className}`}
      style={{
        background: t.background,
        border: `1px solid ${t.borderColor}`,
      }}
    >
      {header && <PanelHeader {...header} />}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
