"use client"

/**
 * AppSurface — the two-column sidebar+content composition that simulates the
 * full Sovereign application inside the landing page.
 *
 * Visual role:
 *   This is the *structural* primitive behind the HeroDashboardPanel. Combine
 *   it with `PanelShell` + `WindowChrome` to recreate the app frame.
 *
 *   ┌───────────────────────────────────────────────────────┐
 *   │ ● ● ●  Sovereign · Intelligence Platform     [Live]   │   ← WindowChrome
 *   ├───────────────────────────────────────────────────────┤
 *   │        │                                              │
 *   │  SIDE  │   ┌────────────────────────────────────┐    │   ← Central panel
 *   │  22%   │   │                                    │    │
 *   │        │   │         content                    │    │
 *   │        │   │                                    │    │
 *   │        │   └────────────────────────────────────┘    │
 *   │        │                                              │
 *   └───────────────────────────────────────────────────────┘
 *
 * Structural rules that must be preserved:
 *   - Sidebar width: 22% of the panel
 *   - Sidebar padding: px-5 py-5, gap-6 between sections
 *   - Central panel margin: my-[1%] mr-[1%]
 *   - Central panel radius: 6px (NOT 17px — that's the outer shell only)
 *   - Central panel background: diagonal sheen gradient
 *   - Central panel border: rgba(147,147,147,0.2)
 */

import * as React from "react"

export interface AppSurfaceProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  /**
   * Sidebar width as a percentage of the surface. Default 22% — the value
   * used by the production HeroDashboardPanel. Do not go below 18% or above
   * 26%; the proportion is calibrated to the type scale.
   */
  sidebarWidth?: string
}

export function AppSurface({
  sidebar,
  children,
  sidebarWidth = "22%",
}: AppSurfaceProps) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar column */}
      <div
        className="flex shrink-0 flex-col gap-6 px-5 py-5"
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </div>

      {/* Central panel — diagonal sheen + inner border */}
      <div
        className="my-[1%] mr-[1%] flex flex-1 flex-col overflow-hidden rounded-[6px] border"
        style={{
          borderColor: "rgba(147,147,147,0.2)",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.012) 0%, #070E1F 28%)",
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Sidebar building blocks ─────────────────────────────────────────────────

export interface SidebarNavItem {
  icon: React.ComponentType<{
    className?: string
    style?: React.CSSProperties
    strokeWidth?: number
  }>
  label: string
}

export interface NavSectionProps {
  label: string
  items: SidebarNavItem[]
  activeItem?: string
  onItemClick?: (label: string) => void
}

/**
 * NavSection — a sidebar section (e.g. "Platform", "System").
 *
 * Do not alter:
 *   - section label size 9px / weight 500 / color #8a8a8a
 *   - item text 10px / weight 500
 *   - icon 11×11px with strokeWidth 1.5
 *   - active state: bg white/0.08, hover: bg white/0.06
 */
export function NavSection({
  label,
  items,
  activeItem,
  onItemClick,
}: NavSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="mb-1 text-[9px] font-medium text-[#8a8a8a]">{label}</p>
      {items.map(({ icon: Icon, label: itemLabel }) => {
        const isActive = itemLabel === activeItem
        return (
          <div
            key={itemLabel}
            onClick={() => onItemClick?.(itemLabel)}
            className={`group flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-[4.5px] transition-colors duration-150 ${
              isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.06]"
            }`}
          >
            <Icon
              className={`shrink-0 transition-colors duration-150 ${
                isActive
                  ? "text-white/90"
                  : "text-white/55 group-hover:text-white/90"
              }`}
              style={{ width: "11px", height: "11px" }}
              strokeWidth={1.5}
            />
            <span
              className={`text-[10px] font-medium leading-none transition-colors duration-150 ${
                isActive
                  ? "text-white"
                  : "text-white/70 group-hover:text-white/95"
              }`}
            >
              {itemLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}
