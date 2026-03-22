import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchPlatformRolesForUser,
  canManageGlobalPlatformRoles,
} from "@/lib/auth/platform-roles";
import { loadPlatformUsersList } from "@/lib/admin/load-platform-users";
import { redirect } from "next/navigation";
import { PlatformUsersTable } from "@/components/admin/platform-users-table";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function AdminPlatformUsersPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const roles = await fetchPlatformRolesForUser(supabase, user.id);
  if (!canManageGlobalPlatformRoles(roles)) {
    redirect("/admin/entities");
  }

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  let list;
  try {
    list = await loadPlatformUsersList({ page, q });
  } catch (e) {
    return (
      <div className="p-6">
        <p className="text-destructive text-sm">
          Failed to load users:{" "}
          {e instanceof Error ? e.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const adminClient = createAdminClient();
  const { data: superuserRows } = await adminClient
    .from("user_platform_roles")
    .select("user_id")
    .eq("role", "superuser");

  const soleSuperuserId =
    superuserRows?.length === 1 ? superuserRows[0].user_id : null;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link
            href="/admin"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Platform Administration
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Users & global roles
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Superuser only. Grant or revoke{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">
            platform_admin
          </code>{" "}
          (entity governance) and{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">
            superuser
          </code>{" "}
          (this panel + entity governance). Project roles stay on each project’s
          team page.
        </p>
      </div>

      <PlatformUsersTable
        rows={list.rows}
        currentUserId={user.id}
        soleSuperuserId={soleSuperuserId}
        page={list.page}
        pageSize={list.pageSize}
        hasNextPage={list.hasNextPage}
        totalPages={list.totalPages}
        initialQ={q}
        scanLimited={list.scanLimited}
      />
    </div>
  );
}
