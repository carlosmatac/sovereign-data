"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Image from "next/image";
import {
  LayoutDashboard,
  FolderKanban,
  Mic,
  MessageSquare,
  Network,
  Settings,
  Shield,
  LogOut,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Projects",
    href: "/projects",
    icon: FolderKanban,
  },
  {
    title: "All Interviews (Search)",
    href: "/interviews",
    icon: Mic,
  },
  {
    title: "Intelligence Chat",
    href: "/chat",
    icon: MessageSquare,
  },
  {
    title: "Network Explorer",
    href: "/network",
    icon: Network,
  },
  // Reports hidden for demo — route still exists, remove comment to restore
];

const systemItems = [
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

interface AppSidebarProps {
  user: {
    email?: string;
    name?: string;
  };
  /** Entity governance or superuser — shows System → Platform Administration. */
  showPlatformAdministration?: boolean;
}

export function AppSidebar({
  user,
  showPlatformAdministration = false,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, isMobile } = useSidebar();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/login");
  };

  const systemNavItems = [
    ...(showPlatformAdministration
      ? [
          {
            title: "Platform Administration",
            href: "/admin",
            icon: Shield,
          },
        ]
      : []),
    ...systemItems,
  ];

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email?.slice(0, 2).toUpperCase() ?? "SD";

  return (
    <Sidebar collapsible="icon">
      <SidebarRail />
      <SidebarHeader className="border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            {state === "expanded" || isMobile ? (
              <Link
                href="/projects"
                className="hover:bg-sidebar-accent/50 flex items-center rounded-md px-2 py-3 transition-colors"
              >
                <Image
                  src="/apaisado_con_logo_v2.svg"
                  alt="Sovereign Data — Intelligence Platform"
                  width={900}
                  height={200}
                  className="w-full max-w-[200px] object-contain dark:brightness-110"
                  priority
                />
              </Link>
            ) : (
              <SidebarMenuButton
                asChild
                tooltip={{ children: "Sovereign Data — Projects" }}
                className="group-data-[collapsible=icon]:!h-auto group-data-[collapsible=icon]:!min-h-10 group-data-[collapsible=icon]:!w-full group-data-[collapsible=icon]:!max-w-none group-data-[collapsible=icon]:!shrink-0 group-data-[collapsible=icon]:!p-2 group-data-[collapsible=icon]:!px-1.5 overflow-visible"
              >
                <Link
                  href="/projects"
                  aria-label="Sovereign Data — go to projects"
                  className="flex w-full items-center justify-center"
                >
                  <Image
                    src="/SD_v2.svg"
                    alt=""
                    width={32}
                    height={32}
                    className="size-8 object-contain dark:brightness-110"
                  />
                </Link>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  title={
                    state === "collapsed" && !isMobile
                      ? (user.name ?? user.email ?? "Account menu")
                      : undefined
                  }
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="text-sm font-medium">
                      {user.name ?? "User"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-[--radix-popper-anchor-width]"
              >
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
