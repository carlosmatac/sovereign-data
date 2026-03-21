import type { CSSProperties } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardInsetHeader } from "@/components/dashboard/dashboard-inset-header";
import { createClient } from "@/lib/supabase/server";
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

  // Fetch profile for display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("sidebar_state")?.value;
  const sidebarDefaultOpen = sidebarCookie !== "false";

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
      />
      <SidebarInset className="flex min-h-svh min-w-0 flex-col">
        <DashboardInsetHeader />
        <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
