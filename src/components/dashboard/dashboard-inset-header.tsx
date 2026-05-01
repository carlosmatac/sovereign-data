"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Aksum workspace top bar — chrome label.
 *
 * On desktop, the sidebar collapse/expand control lives inside the
 * sidebar itself (see `AppSidebar`), where it spatially belongs — this
 * strip carries only the application identity label.
 *
 * On mobile (`<md`) the sidebar is rendered as a Sheet drawer that has
 * no visible edge to expand from, so we keep a hamburger trigger here
 * gated by `md:hidden`. Desktop never shows it.
 *
 * Anatomy (left → right):
 *   [≡ on mobile]   AKSUM · INTELLIGENCE PLATFORM
 *
 * The strip uses a desaturated graphite/navy gradient so it reads as a
 * subtle structural band rather than a saturated blue chrome. Header
 * height kept at ≈ 44px so the SidebarInset body layout / scroll
 * region calculations stay intact.
 */
export function DashboardInsetHeader() {
  return (
    <header
      role="banner"
      className="flex h-11 shrink-0 items-center gap-2 px-4 md:px-5"
      style={{
        background: "linear-gradient(to bottom, #0E1118, #0B0D12)",
        borderBottom: "1px solid rgba(147,147,147,0.08)",
      }}
    >
      <SidebarTrigger
        aria-label="Open navigation"
        className="-ml-1 size-7 shrink-0 text-white/55 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/95 md:hidden"
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
