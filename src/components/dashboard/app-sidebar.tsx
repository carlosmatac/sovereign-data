"use client";

import { Fragment } from "react";
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
import { IntelligenceChatNavThreads } from "@/components/dashboard/intelligence-chat-nav-threads";

const platformNavItems = [
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
    title: "Copilot",
    href: "/chat",
    icon: MessageSquare,
  },
  {
    title: "Network Explorer",
    href: "/network",
    icon: Network,
  },
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
  const inChatSection = pathname.startsWith("/chat");

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
    <Sidebar collapsible="icon" variant="inset">
      <SidebarRail />
      <SidebarHeader className="px-3 pt-4 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            {state === "expanded" || isMobile ? (
              <Link
                href="/projects"
                className="flex items-center rounded-[4px] px-2 py-2 transition-colors duration-150 hover:bg-white/[0.04]"
              >
                <Image
                  src="/aksum_white_long.svg"
                  alt="Aksum — Intelligence Platform"
                  width={2186}
                  height={885}
                  className="h-8 w-auto object-contain opacity-90"
                  priority
                />
              </Link>
            ) : (
              <SidebarMenuButton
                asChild
                tooltip={{ children: "Aksum — Projects" }}
                className="group-data-[collapsible=icon]:!h-auto group-data-[collapsible=icon]:!min-h-10 group-data-[collapsible=icon]:!w-full group-data-[collapsible=icon]:!max-w-none group-data-[collapsible=icon]:!shrink-0 group-data-[collapsible=icon]:!p-2 group-data-[collapsible=icon]:!px-1.5 overflow-visible"
              >
                <Link
                  href="/projects"
                  aria-label="Aksum — go to projects"
                  className="flex w-full items-center justify-center"
                >
                  <Image
                    src="/aksum_white.svg"
                    alt=""
                    width={32}
                    height={32}
                    className="size-7 object-contain opacity-90"
                  />
                </Link>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-5 px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel
            className="mb-1 px-2 text-[10.5px] font-semibold uppercase"
            style={{
              letterSpacing: "0.10em",
              color: "rgba(255,255,255,0.42)",
            }}
          >
            Platform
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformNavItems.map((item) =>
                item.href === "/chat" ? (
                  <Fragment key="/chat">
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={inChatSection}
                        tooltip="Copilot"
                        className="h-9 gap-2.5 rounded-[5px] px-2.5 text-[12.5px] font-medium text-white/72 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/95 data-[active=true]:bg-white/[0.08] data-[active=true]:text-white"
                      >
                        <Link href="/chat">
                          <item.icon className="size-[14px]" strokeWidth={1.5} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {inChatSection ? (
                      <SidebarMenuItem className="list-none p-0">
                        <IntelligenceChatNavThreads />
                      </SidebarMenuItem>
                    ) : null}
                  </Fragment>
                ) : (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(item.href)}
                      tooltip={item.title}
                      className="h-9 gap-2.5 rounded-[5px] px-2.5 text-[12.5px] font-medium text-white/72 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/95 data-[active=true]:bg-white/[0.08] data-[active=true]:text-white"
                    >
                      <Link href={item.href}>
                        <item.icon className="size-[14px]" strokeWidth={1.5} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel
            className="mb-1 px-2 text-[10.5px] font-semibold uppercase"
            style={{
              letterSpacing: "0.10em",
              color: "rgba(255,255,255,0.42)",
            }}
          >
            System
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.title}
                    className="h-9 gap-2.5 rounded-[5px] px-2.5 text-[12.5px] font-medium text-white/72 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/95 data-[active=true]:bg-white/[0.08] data-[active=true]:text-white"
                  >
                    <Link href={item.href}>
                      <item.icon className="size-[14px]" strokeWidth={1.5} />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/*
        Account block — lives below a hairline divider so it reads as a
        separate "system identity" zone, not a floating nav item. Padding
        and inner gap follow the panel-system tonal hierarchy:
          - hairline border at sidebar-foreground/0.06 → soft separation
          - account row uses 28px avatar + tight 2-line stack
          - whole row stays on the sidebar surface (no extra fill at rest)
            so the slightly darker sidebar tone keeps reading as "deeper"
        Behavior: the dropdown trigger / Settings / Sign out paths are
        unchanged.
      */}
      <SidebarFooter
        className="px-2 pb-3 pt-2.5 group-data-[collapsible=icon]:px-1.5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="h-auto items-center gap-2.5 rounded-[6px] px-2 py-2 transition-colors duration-150 hover:bg-white/[0.05] data-[state=open]:bg-white/[0.06] group-data-[collapsible=icon]:!h-9 group-data-[collapsible=icon]:!w-9 group-data-[collapsible=icon]:!justify-center group-data-[collapsible=icon]:!px-0"
                  title={
                    state === "collapsed" && !isMobile
                      ? (user.name ?? user.email ?? "Account menu")
                      : undefined
                  }
                >
                  <Avatar className="size-7 shrink-0 group-data-[collapsible=icon]:size-7">
                    <AvatarFallback
                      className="text-[10.5px] font-semibold"
                      style={{
                        background: "rgba(91,156,246,0.12)",
                        color: "#9CC2F8",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col leading-none">
                    <span className="truncate text-[12px] font-semibold text-white/92">
                      {user.name ?? "User"}
                    </span>
                    <span
                      className="mt-[3px] truncate text-[10.5px] text-white/45"
                      style={{ letterSpacing: "-0.005em" }}
                    >
                      {user.email}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto size-3.5 shrink-0 text-white/35 transition-colors duration-150 group-hover/menu-item:text-white/60" />
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
