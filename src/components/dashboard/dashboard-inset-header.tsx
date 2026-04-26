"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Real product top bar — Sovereign workspace chrome.
 *
 * This is the chrome strip that sits at the head of the central workspace
 * panel inside the shared dashboard layout. It carries the application
 * identity (uppercase product label at 10px / 0.07em tracking) and the
 * sidebar trigger — nothing more.
 *
 * Anatomy (left → right):
 *   [SidebarTrigger]   AKSUM · INTELLIGENCE PLATFORM
 *
 * Deliberate omissions:
 *   - No traffic-light dots. Those are a landing-only presentation device
 *     (they imply "this is a window inside a webpage"); inside the actual
 *     product they're fiction.
 *   - No "Live" status pill. The product is always live when the user is
 *     looking at it — the pill carries no operational information.
 *
 * Behavioural requirements preserved:
 *   - `SidebarTrigger` is still the primary control for collapsing /
 *     expanding the sidebar on every viewport (including the mobile sheet
 *     toggle). It sits at the leading edge so it remains thumb-reachable.
 *   - Header height kept at ≈ 44px so the SidebarInset body layout / scroll
 *     region calculations stay intact.
 *
 * Composition note: this header lives *inside* the rounded central panel
 * (see `(dashboard)/layout.tsx`). The strip uses the same top-to-bottom
 * gradient as the landing's WindowChrome — `#0D1B32` → `#0B1729` — and a
 * single hairline `rgba(147,147,147,0.10)` bottom border so it reads as a
 * structural band of the workspace, not an isolated control row.
 */
export function DashboardInsetHeader() {
  return (
    <header
      role="banner"
      className="flex h-11 shrink-0 items-center gap-3 px-3 md:px-4"
      style={{
        background: "linear-gradient(to bottom, #0D1B32, #0B1729)",
        borderBottom: "1px solid rgba(147,147,147,0.10)",
      }}
    >
      <SidebarTrigger
        className="-ml-0.5 size-7 shrink-0 text-white/55 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/95"
        aria-label="Toggle navigation"
      />

      <span
        className="hidden font-medium uppercase sm:inline"
        style={{
          fontSize: "10px",
          letterSpacing: "0.07em",
          color: "rgba(255,255,255,0.32)",
        }}
      >
        Aksum · Intelligence Platform
      </span>
    </header>
  );
}
