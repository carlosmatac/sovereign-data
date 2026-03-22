import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPlatformRolesForUser,
  hasEntityGovernanceAccess,
} from "@/lib/auth/platform-roles";
import { loadGovernedEntityDetail } from "@/lib/admin/load-governance-entities";
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

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminEntityDetailPage({ params }: Props) {
  const { id } = await params;

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
  const result = await loadGovernedEntityDetail(id);

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

      <GovernanceEntityDetailPanel entity={entity} isSuperuser={isSuperuser} />
    </div>
  );
}
