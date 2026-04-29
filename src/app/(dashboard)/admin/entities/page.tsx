import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPlatformRolesForUser,
  canManageGlobalPlatformRoles,
  hasEntityGovernanceAccess,
} from "@/lib/auth/platform-roles";
import {
  GOVERNANCE_ENTITIES_PAGE_SIZE,
  loadGovernanceEntitiesList,
  loadProjectsForGovernanceFilter,
} from "@/lib/admin/load-governance-entities";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GovernanceEntitiesTable } from "@/components/admin/governance-entities-table";
import { ArrowLeft, Database } from "lucide-react";
import { isEntityType } from "@/types/database";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  searchParams: Promise<{
    q?: string;
    page?: string;
    type?: string;
    scope?: string;
    project_id?: string;
    notice?: string;
  }>;
}

export default async function AdminEntitiesPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const roles = await fetchPlatformRolesForUser(supabase, user.id);
  if (!hasEntityGovernanceAccess(roles)) {
    redirect("/projects");
  }

  const isSuperuser = roles.includes("superuser");
  const params = await searchParams;
  const listNotice =
    typeof params.notice === "string" ? params.notice : undefined;
  const q = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const typeParam = typeof params.type === "string" ? params.type : "all";
  const typeFilter = isEntityType(typeParam) ? typeParam : "all";
  const scopeRaw = typeof params.scope === "string" ? params.scope : "all";
  const scope =
    scopeRaw === "global" || scopeRaw === "project" ? scopeRaw : "all";
  const projectIdParam =
    typeof params.project_id === "string" ? params.project_id : "";
  const projectId =
    scope === "project" && UUID_RE.test(projectIdParam)
      ? projectIdParam
      : "";

  let list;
  try {
    list = await loadGovernanceEntitiesList({
      page,
      q,
      typeFilter,
      scope: scope === "project" && !projectId ? "all" : scope,
      projectId,
    });
  } catch (e) {
    return (
      <div className="mx-auto max-w-2xl p-6 md:p-10">
        <p className="text-destructive text-sm">
          Failed to load entities:{" "}
          {e instanceof Error ? e.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const projects = await loadProjectsForGovernanceFilter();

  const effectiveScope = scope === "project" && !projectId ? "all" : scope;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-10">
      <div className="flex flex-wrap items-center gap-3">
        {isSuperuser ? (
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link
              href="/admin"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Administration home
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link
              href="/projects"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to projects
            </Link>
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg border bg-muted/30">
            <Database className="size-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Entity & knowledge governance
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Browse canonical entities (merged redirects are hidden). Use{" "}
              <span className="text-foreground font-medium">Edit</span> or the
              entity name to open the detail page — that is where you review
              context and save changes.
            </p>
          </div>
        </div>
      </div>

      {listNotice === "invalid_id" ? (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          That link did not contain a valid entity ID. Use the list below to
          select an entity.
        </div>
      ) : null}

      {scope === "project" && !projectId ? (
        <p className="text-amber-700 text-sm dark:text-amber-400">
          Select a project when filtering by &quot;One project&quot;, or choose
          another scope.
        </p>
      ) : null}

      <GovernanceEntitiesTable
        key={`${q}-${typeFilter}-${effectiveScope}-${projectId}-${page}`}
        rows={list.rows}
        projects={projects}
        page={list.page}
        totalPages={list.totalPages}
        totalCount={list.totalCount}
        pageSize={GOVERNANCE_ENTITIES_PAGE_SIZE}
        initialQ={q}
        initialType={typeFilter}
        initialScope={effectiveScope}
        initialProjectId={projectId}
      />

      {canManageGlobalPlatformRoles(roles) ? (
        <p className="text-muted-foreground text-xs">
          Superuser: manage accounts at{" "}
          <Link href="/admin/users" className="text-primary underline">
            Users & global roles
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
