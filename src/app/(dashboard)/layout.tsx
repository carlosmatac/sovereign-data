import type { CSSProperties } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardInsetHeader } from "@/components/dashboard/dashboard-inset-header";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPlatformRolesForUser,
  hasPlatformAdministrationAccess,
} from "@/lib/auth/platform-roles";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profileRes, platformRoles] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    fetchPlatformRolesForUser(supabase, user.id),
  ]);

  const profile = profileRes.data;
  const showPlatformAdministration = hasPlatformAdministrationAccess(
    platformRoles
  );

  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("sidebar_state")?.value;
  const sidebarDefaultOpen = sidebarCookie !== "false";

  /**
   * Shared app shell — "one outer frame with an integrated sidebar and a central
   * working surface", mirroring the landing's `AppSurface` composition:
   *
   *   ┌────────────────────────────────────────────────────────────────────┐
   *   │ Outer shell: #070E1F (--sidebar / --background, shared by both)    │
   *   │  ┌────────┐   ┌──────────────────────────────────────────────────┐ │
   *   │  │        │   │  Central working panel (SidebarInset)            │ │
   *   │  │ Sidebar│   │  bg #080F1E · 6px radius · soft border           │ │
   *   │  │        │   │  ┌── top bar ──┐                                 │ │
   *   │  │        │   │  │             │                                 │ │
   *   │  │        │   │  │  page       │                                 │ │
   *   │  │        │   │  │  content    │                                 │ │
   *   │  │        │   │  └─────────────┘                                 │ │
   *   │  └────────┘   └──────────────────────────────────────────────────┘ │
   *   └────────────────────────────────────────────────────────────────────┘
   *
   * How this is assembled:
   *   - `variant="inset"` on `<Sidebar>` (see `AppSidebar`) makes the shadcn
   *     sidebar-wrapper the outer shell and floats the sidebar column inside it
   *     with an 8px gutter, so the sidebar stops reading as a detached card.
   *   - `SidebarInset` is restyled below so the central panel matches the
   *     landing `AppSurface` central rectangle (6px radius, `#080F1E` surface,
   *     `rgba(147,147,147,0.16)` hairline border) instead of shadcn's default
   *     `rounded-xl` + `shadow-sm` card. Both the sidebar column and the central
   *     panel now sit on the *same* `#070E1F` outer shell, which is what gives
   *     the shared-frame feel — no hard vertical rule between sidebar and
   *     content, no divider boxes inside the sidebar, no edge-to-edge header
   *     line across the content.
   *
   * Functionality preserved: `SidebarProvider` collapsible="icon", mobile Sheet
   * behaviour, rail toggle, routing, active states — all unchanged.
   */
  return (
    <SidebarProvider
      defaultOpen={sidebarDefaultOpen}
      style={
        {
          "--sidebar-width-icon": "3.5rem",
        } as CSSProperties
      }
    >
      <AppSidebar
        user={{
          email: user.email,
          name: profile?.full_name ?? undefined,
        }}
        showPlatformAdministration={showPlatformAdministration}
      />
      <SidebarInset
        className="flex min-w-0 flex-col overflow-hidden bg-[#080F1E] md:rounded-[6px] md:border md:border-[rgba(147,147,147,0.16)] md:shadow-none"
      >
        <DashboardInsetHeader />
        <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
