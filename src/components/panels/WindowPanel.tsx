"use client"

/**
 * WindowPanel — the fastest way to build a "Sovereign-looking" panel.
 *
 * Composes PanelShell + WindowChrome + an optional PanelHeader + a body slot.
 * Use this when you only need a single, flat panel (Copilot, Report, inline
 * content panels). For the full app-frame layout, use AppSurface inside of
 * PanelShell directly.
 *
 * Example:
 *   <WindowPanel
 *     chrome={{ label: "Sovereign · Copilot", status: { tone: "live", text: "Live" } }}
 *     header={{ title: "Intelligence Report", subtitle: "April 2026 · Q1" }}
 *   >
 *     {children}
 *   </WindowPanel>
 */

import * as React from "react"
import { PanelShell, type PanelShellProps } from "./PanelShell"
import { WindowChrome, type WindowChromeProps } from "./WindowChrome"
import { PanelHeader, type PanelHeaderProps } from "./PanelHeader"

export interface WindowPanelProps extends Omit<PanelShellProps, "children"> {
  chrome: WindowChromeProps
  header?: PanelHeaderProps
  /**
   * Optional footer — usually an input bar (chat) or CTA row.
   * Rendered flush to the bottom edge inside the shell.
   */
  footer?: React.ReactNode
  children: React.ReactNode
}

export function WindowPanel({
  chrome,
  header,
  footer,
  children,
  ...shellProps
}: WindowPanelProps) {
  return (
    <PanelShell {...shellProps}>
      <WindowChrome {...chrome} />
      {header && <PanelHeader {...header} />}
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      {footer && (
        <div
          className="shrink-0"
          style={{ borderTop: "1px solid rgba(147,147,147,0.08)" }}
        >
          {footer}
        </div>
      )}
    </PanelShell>
  )
}
