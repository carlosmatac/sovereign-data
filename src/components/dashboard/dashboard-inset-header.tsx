"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Real product top bar.
 *
 * This is the actual in-app header — NOT a simulated browser/window chrome.
 * The landing panels use a WindowChrome strip (traffic-light dots, uppercase
 * "Sovereign · Intelligence Platform" label, status pill) because they need
 * to *look* like an application screenshot inside a marketing page. In the
 * real product, those decorations are fiction and must not appear.
 *
 * Behavioural requirements preserved:
 *   - `SidebarTrigger` remains the primary control for collapsing / expanding
 *     the sidebar on every viewport (including the mobile sheet toggle).
 *   - The header height (≈ 44px) keeps the SidebarInset body layout intact.
 */
export function DashboardInsetHeader() {
  return (
    <header
      role="banner"
      className="flex h-11 shrink-0 items-center gap-2 px-3 md:px-4"
      style={{
        background: "rgba(10, 17, 35, 0.6)",
        borderBottom: "1px solid rgba(147,147,147,0.10)",
      }}
    >
      <SidebarTrigger className="-ml-0.5 size-8 text-white/65 hover:bg-white/[0.06] hover:text-white/95" />
    </header>
  );
}
