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
                  src="/sovereign_log_apaisado.svg"
                  alt="Sovereign Data — Intelligence Platform"
                  width={900}
                  height={200}
                  className="w-full max-w-[138px] object-contain opacity-90"
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
                    src="/sovereign_logo.svg"
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

      <SidebarFooter className="px-2 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="rounded-[6px] px-2.5 py-2 transition-colors duration-150 hover:bg-white/[0.05]"
                  title={
                    state === "collapsed" && !isMobile
                      ? (user.name ?? user.email ?? "Account menu")
                      : undefined
                  }
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback
                      className="text-[11px] font-semibold"
                      style={{
                        background: "rgba(91,156,246,0.10)",
                        color: "#5B9CF6",
                      }}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-[3px] leading-none">
                    <span className="text-[12.5px] font-medium text-white/92">
                      {user.name ?? "User"}
                    </span>
                    <span className="text-[10.5px] text-white/50">
                      {user.email}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto size-4 text-white/50" />
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
