import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPlatformRolesForUser,
  hasEntityGovernanceAccess,
} from "@/lib/auth/platform-roles";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Database } from "lucide-react";

export default async function AdminEntitiesPage() {
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

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6 md:p-10">
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
            <p className="text-muted-foreground text-sm">
              Maintain canonical records used across search, graph, and
              reports.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming next</CardTitle>
          <CardDescription>
            The full admin workspace for entities (search, edit canonical
            fields, aliases) is specified in{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              admin-entity-governance-dashboard
            </code>
            . Until that ships, corrections can still be made from interview
            pages via the Entity Editor where you have project editor access.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          You have <span className="text-foreground">entity governance</span>{" "}
          access (
          <span className="text-foreground">platform admin</span> or{" "}
          <span className="text-foreground">superuser</span>). No separate
          action is required on this screen today.
        </CardContent>
      </Card>
    </div>
  );
}
