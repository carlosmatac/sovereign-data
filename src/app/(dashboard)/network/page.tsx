import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EntityGraph } from "@/components/network/entity-graph";

export default async function NetworkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = createAdminClient();

  // Fetch projects this user is a member of
  const { data: memberships } = await admin
    .from("project_members")
    .select("project_id, projects(id, name)")
    .eq("user_id", user.id);

  const projects = (memberships ?? [])
    .map((m) => {
      const p = m.projects as unknown as { id: string; name: string } | null;
      return p ? { id: p.id, name: p.name } : null;
    })
    .filter((p): p is { id: string; name: string } => p !== null);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Network Explorer</h1>
        <p className="mt-1 text-muted-foreground">
          Visualise entity relationships extracted from your interviews. Click a
          node to explore its connections.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            You are not a member of any projects yet.
          </p>
        </div>
      ) : (
        <EntityGraph projects={projects} initialProjectId={projects[0]?.id} />
      )}
    </div>
  );
}
