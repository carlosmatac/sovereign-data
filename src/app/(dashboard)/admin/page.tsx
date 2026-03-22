import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPlatformRolesForUser,
  canManageGlobalPlatformRoles,
  hasEntityGovernanceAccess,
} from "@/lib/auth/platform-roles";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Database, Shield, Users } from "lucide-react";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const roles = await fetchPlatformRolesForUser(supabase, user.id);
  const entityGov = hasEntityGovernanceAccess(roles);
  const superuser = canManageGlobalPlatformRoles(roles);

  if (!entityGov) {
    redirect("/projects");
  }

  // platform_admin only: single destination — entity & knowledge governance
  if (!superuser) {
    redirect("/admin/entities");
  }

  // Superuser: two operational areas — hub (no empty placeholder)
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Platform Administration
        </h1>
        <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
          Operator tools for this deployment. User and role changes are separate
          from knowledge-base governance — use the section that matches the
          task.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/users" className="block rounded-lg outline-none">
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-md border bg-background">
                <Users className="size-5 text-muted-foreground" />
              </div>
              <CardTitle className="text-lg">Users & global roles</CardTitle>
              <CardDescription>
                Search accounts, grant or revoke{" "}
                <code className="text-xs">platform_admin</code> and{" "}
                <code className="text-xs">superuser</code>. Superuser only.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/entities" className="block rounded-lg outline-none">
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-md border bg-background">
                <Database className="size-5 text-muted-foreground" />
              </div>
              <CardTitle className="text-lg">Entity & knowledge governance</CardTitle>
              <CardDescription>
                Canonical entities and structured knowledge (e.g. leadership
                changes, org metadata). Full tooling ships with the entity
                governance feature; this entry is available now for navigation.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <Shield className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <span className="text-foreground font-medium">Superuser</span> can use
          both areas.{" "}
          <span className="text-foreground font-medium">Platform admin</span>{" "}
          (without superuser) is routed here only for entity governance — not
          for global role management.
        </span>
      </p>
    </div>
  );
}
