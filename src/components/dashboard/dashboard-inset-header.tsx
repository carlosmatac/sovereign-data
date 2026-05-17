"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Aksum workspace top bar.
 *
 * Shows the current section name derived from the pathname.
 * Hosts the theme toggle (dark ↔ light) on the right edge.
 */

const SECTION_TITLES: Array<[string, string]> = [
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
        background: "var(--sv-chrome-gradient)",
        borderBottom: "1px solid var(--sv-border-divider)",
      }}
    >
      <SidebarTrigger
        aria-label="Open navigation"
        className="-ml-1 size-7 shrink-0 transition-colors duration-150 md:hidden"
        style={{
          color: "var(--sv-text-muted)",
        }}
      />

      <span
        className="hidden font-medium uppercase sm:inline"
        style={{
          fontSize: "10px",
          letterSpacing: "0.07em",
          color: "var(--sv-text-eyebrow)",
        }}
      >
        {sectionTitle}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
