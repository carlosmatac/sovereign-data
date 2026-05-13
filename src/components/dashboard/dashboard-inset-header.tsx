"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Aksum workspace top bar.
 *
 * Shows the current section name derived from the pathname instead of
 * a static "AKSUM · KNOWLEDGE PLATFORM" label, giving the user instant
 * orientation context without redundant branding noise.
 *
 * On mobile (<md) a hamburger trigger is included since the sidebar is
 * rendered as a Sheet with no visible edge to expand from.
 */

const SECTION_TITLES: Array<[string, string]> = [
  // More-specific paths first
  ["/interviews/upload", "Add Source"],
  ["/interviews/", "Knowledge"],
  ["/interviews", "Knowledge"],
  ["/projects/new", "New Project"],
  ["/projects/", "Projects"],
  ["/projects", "Projects"],
  ["/chat/new", "Copilot"],
  ["/chat", "Copilot"],
  ["/network", "Network Explorer"],
  ["/reports", "Reports"],
  ["/settings", "Settings"],
  ["/admin", "Admin"],
  ["/dashboard", "Dashboard"],
];

function getSectionTitle(pathname: string): string {
  for (const [prefix, title] of SECTION_TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix)) return title;
  }
  return "Aksum";
}

export function DashboardInsetHeader() {
  const pathname = usePathname();
  const sectionTitle = getSectionTitle(pathname);

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
        {sectionTitle}
      </span>
    </header>
  );
}
