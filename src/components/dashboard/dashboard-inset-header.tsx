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
 *
 * Shell composition note: this header now lives *inside* the rounded central
 * panel (see `(dashboard)/layout.tsx`). It intentionally has no background fill
 * and no hard bottom border — the central panel's own rectangle is the frame,
 * and a heavy divider here would fight it. The bar stays as a quiet, minimal
 * control strip that carries the sidebar toggle and nothing else.
 */
export function DashboardInsetHeader() {
  return (
    <header
      role="banner"
      className="flex h-11 shrink-0 items-center gap-2 bg-transparent px-3 md:px-4"
    >
      <SidebarTrigger className="-ml-0.5 size-8 text-white/65 hover:bg-white/[0.06] hover:text-white/95" />
    </header>
  );
}
