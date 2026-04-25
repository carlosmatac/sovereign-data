import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPlatformRolesForUser,
  hasEntityGovernanceAccess,
} from "@/lib/auth/platform-roles";
import { loadGovernedEntityDetail } from "@/lib/admin/load-governance-entities";
import {
  GOVERNANCE_RELATIONSHIPS_PAGE_SIZE,
  loadRelationshipsForEntity,
  type GovernanceRelationshipDirectionFilter,
  type GovernanceRelationshipStatusFilter,
} from "@/lib/admin/load-governance-relationships";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GovernanceEntityDetailPanel } from "@/components/admin/governance-entity-detail";
import {
  EntityGovernanceLoadError,
  EntityGovernanceNotFound,
} from "@/components/admin/entity-governance-detail-states";
import { ArrowLeft } from "lucide-react";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_FILTER_VALUES: GovernanceRelationshipStatusFilter[] = [
  "all",
  "active",
  "pending",
  "approved",
  "rejected",
];
const DIRECTION_FILTER_VALUES: GovernanceRelationshipDirectionFilter[] = [
  "all",
  "incoming",
  "outgoing",
];

function parseStatusFilter(
  raw: string | undefined
): GovernanceRelationshipStatusFilter {
  if (raw && (STATUS_FILTER_VALUES as string[]).includes(raw)) {
    return raw as GovernanceRelationshipStatusFilter;
  }
  return "all";
}

function parseDirectionFilter(
  raw: string | undefined
): GovernanceRelationshipDirectionFilter {
  if (raw && (DIRECTION_FILTER_VALUES as string[]).includes(raw)) {
    return raw as GovernanceRelationshipDirectionFilter;
  }
  return "all";
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    rel_status?: string;
    rel_direction?: string;
    rel_page?: string;
  }>;
}

export default async function AdminEntityDetailPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const statusFilter = parseStatusFilter(sp.rel_status);
  const directionFilter = parseDirectionFilter(sp.rel_direction);
  const page = parsePage(sp.rel_page);

  if (!UUID_RE.test(id)) {
    redirect("/admin/entities?notice=invalid_id");
  }

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
  const [result, relationships] = await Promise.all([
    loadGovernedEntityDetail(id),
    loadRelationshipsForEntity({
      entityId: id,
      page,
      pageSize: GOVERNANCE_RELATIONSHIPS_PAGE_SIZE,
      statusFilter,
      directionFilter,
    }),
  ]);

  if (!result.ok) {
    if (result.reason === "not_found") {
      return (
        <div className="mx-auto max-w-3xl p-6 md:p-10">
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link
                href="/admin/entities"
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Entity list
              </Link>
            </Button>
          </div>
          <EntityGovernanceNotFound id={id} />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link
              href="/admin/entities"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Entity list
            </Link>
          </Button>
        </div>
        <EntityGovernanceLoadError message={result.message} />
      </div>
    );
  }

  const { entity } = result;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link
            href="/admin/entities"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Entity list
          </Link>
        </Button>
        {isSuperuser ? (
          <Button variant="ghost" size="sm" asChild>
            <Link
              href="/admin"
              className="text-muted-foreground hover:text-foreground"
            >
              Administration home
            </Link>
          </Button>
        ) : null}
      </div>

      <header className="space-y-1 border-b pb-6">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Entity governance
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {entity.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Review context below, then edit canonical name, type, and description
          when needed.
        </p>
      </header>

      <GovernanceEntityDetailPanel
        entity={entity}
        isSuperuser={isSuperuser}
        relationships={{
          rows: relationships.rows,
          page: relationships.page,
          pageSize: relationships.pageSize,
          totalCount: relationships.totalCount,
          totalPages: relationships.totalPages,
          statusFilter,
          directionFilter,
        }}
      />
    </div>
  );
}
