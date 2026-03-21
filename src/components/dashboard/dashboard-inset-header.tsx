"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

export function DashboardInsetHeader() {
  return (
    <header
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 flex h-12 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-4"
      role="banner"
    >
      <SidebarTrigger className="-ml-0.5" />
    </header>
  );
}
