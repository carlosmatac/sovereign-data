import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NetworkExplorer } from "@/components/network/network-explorer";

export default async function NetworkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = createAdminClient();

  const [entitiesResult, relationshipsResult, mentionsResult] =
    await Promise.all([
      admin.from("entities").select("id, name, type, description"),
      admin
        .from("entity_relationships")
        .select("id, source_entity_id, target_entity_id, relation_type, confidence, evidence_text, interview_id"),
      admin
        .from("entity_mentions")
        .select("entity_id, interview_id, sentiment")
    ]);

  const entities = entitiesResult.data ?? [];
  const relationships = relationshipsResult.data ?? [];
  const mentions = mentionsResult.data ?? [];

  // Compute mention counts per entity
  const mentionCounts: Record<string, number> = {};
  mentions.forEach((m) => {
    mentionCounts[m.entity_id] = (mentionCounts[m.entity_id] ?? 0) + 1;
  });

  // Build connection counts per entity from relationships
  const connectionCounts: Record<string, number> = {};
  relationships.forEach((r) => {
    connectionCounts[r.source_entity_id] =
      (connectionCounts[r.source_entity_id] ?? 0) + 1;
    connectionCounts[r.target_entity_id] =
      (connectionCounts[r.target_entity_id] ?? 0) + 1;
  });

  const enrichedEntities = entities.map((e) => ({
    ...e,
    mentionCount: mentionCounts[e.id] ?? 0,
    connectionCount: connectionCounts[e.id] ?? 0,
  }));

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Network Explorer
        </h1>
        <p className="mt-1 text-muted-foreground">
          Explore entity relationships extracted from your interviews. Select an
          entity to see its connections.
        </p>
      </div>

      <NetworkExplorer
        entities={enrichedEntities}
        relationships={relationships}
      />
    </div>
  );
}
