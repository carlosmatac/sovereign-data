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
   *   │ Outer shell: #070A14 (--sidebar, deeper matte ink-navy)            │
   *   │  ┌────────┐   ┌──────────────────────────────────────────────────┐ │
   *   │  │        │   │  Central working panel (SidebarInset)            │ │
   *   │  │ Sidebar│   │  bg #080F1E · 6px radius · whisper border        │ │
   *   │  │(deeper)│   │  ┌── top bar ──┐                                 │ │
   *   │  │        │   │  │             │                                 │ │
   *   │  │        │   │  │  page       │                                 │ │
   *   │  │        │   │  │  content    │                                 │ │
   *   │  │        │   │  └─────────────┘                                 │ │
   *   │  └────────┘   └──────────────────────────────────────────────────┘ │
   *   └────────────────────────────────────────────────────────────────────┘
   *
   * How this is assembled:
   *   - `variant="inset"` on `<Sidebar>` (see `AppSidebar`) makes the shadcn
   *     sidebar-wrapper the outer shell and floats the sidebar column inside
   *     it with an 8px gutter, so the sidebar stops reading as a detached card.
   *   - `SidebarInset` is restyled below as the *lifted* workspace surface:
   *     `#080F1E` (~1 tonal step above the new darker shell), a 6px radius to
   *     match the landing `AppSurface` rectangle, a hairline border dropped to
   *     `rgba(147,147,147,0.08)` — the separation now comes from tone, not a
   *     hard rule — and a very restrained ambient shadow (barely perceptible)
   *     so the panel reads as slightly elevated above the recessed sidebar
   *     layer without becoming a floating card.
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
        className="flex min-w-0 flex-col overflow-hidden bg-[#080F1E] md:rounded-[6px] md:border md:border-[rgba(147,147,147,0.08)] md:shadow-[0_0_0_1px_rgba(255,255,255,0.012),0_24px_48px_-32px_rgba(0,0,0,0.75)]"
      >
        <DashboardInsetHeader />
        <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
