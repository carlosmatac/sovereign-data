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
    <div className="px-5 py-6 lg:px-8 lg:py-7">
      <div className="mb-6">
        <h1
          className="text-[28px] font-semibold text-white"
          style={{ letterSpacing: "-0.020em", lineHeight: 1.05 }}
        >
          Network Explorer
        </h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-[1.6] text-white/62">
          Visualise entity relationships extracted from your interviews. Click
          a node to explore its connections.
        </p>
      </div>

      {projects.length === 0 ? (
        <div
          className="rounded-[6px] border border-dashed py-14 text-center"
          style={{
            borderColor: "rgba(147,147,147,0.22)",
            background: "#080F1E",
          }}
        >
          <p className="text-[13px] text-white/60">
            You are not a member of any projects yet.
          </p>
        </div>
      ) : (
        <EntityGraph projects={projects} initialProjectId={projects[0]?.id} />
      )}
    </div>
  );
}
