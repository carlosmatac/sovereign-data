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
export interface SectionSurfaceProps {
  header?: PanelHeaderProps;
  /** Padding applied to the body (between the header and the bottom edge). */
  bodyClassName?: string;
  /** Additional class names on the outer surface. */
  className?: string;
  children: React.ReactNode;
}

export function SectionSurface({
  header,
  bodyClassName = "p-4",
  className = "",
  children,
}: SectionSurfaceProps) {
  return (
    <div
      className={`overflow-hidden rounded-[6px] ${className}`}
      style={{
        background: "#080F1E",
        border: "1px solid rgba(147,147,147,0.13)",
      }}
    >
      {header && <PanelHeader {...header} />}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
