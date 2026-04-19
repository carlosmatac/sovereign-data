import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProjectRole } from "@/lib/auth/project-role";

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  description: string | null;
  mentionCount: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationType: string;
  confidence: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * GET /api/graph/[projectId]
 *
 * Returns entities (nodes) and relationships (edges) scoped to a project.
 * Used by the Network Explorer graph view.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getUserProjectRole(projectId);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // ── Step 1: Get all interview IDs for this project ─────────────
  const { data: interviews, error: interviewsError } = await admin
    .from("interviews")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "COMPLETED");

  if (interviewsError) {
    return NextResponse.json({ error: interviewsError.message }, { status: 500 });
  }

  if (!interviews || interviews.length === 0) {
    return NextResponse.json({ nodes: [], edges: [] } satisfies GraphData);
  }

  const interviewIds = interviews.map((i) => i.id);

  // ── Step 2: Get entity mentions for these interviews ───────────
  const { data: mentions, error: mentionsError } = await admin
    .from("entity_mentions")
    .select("entity_id")
    .in("interview_id", interviewIds);

  if (mentionsError) {
    return NextResponse.json({ error: mentionsError.message }, { status: 500 });
  }

  if (!mentions || mentions.length === 0) {
    return NextResponse.json({ nodes: [], edges: [] } satisfies GraphData);
  }

  // Count mentions per entity
  const mentionCounts: Record<string, number> = {};
  for (const m of mentions) {
    mentionCounts[m.entity_id] = (mentionCounts[m.entity_id] ?? 0) + 1;
  }

  const entityIds = Object.keys(mentionCounts);

  // ── Step 3: Fetch entity details ───────────────────────────────
  const { data: entities, error: entitiesError } = await admin
    .from("entities")
    .select("id, name, type, description")
    .in("id", entityIds);

  if (entitiesError) {
    return NextResponse.json({ error: entitiesError.message }, { status: 500 });
  }

  // ── Step 4: Get relationships for these interviews ─────────────
  //
  // Editorial rule (see docs/features/on-going/editable-relationship-governance.md):
  // a `rejected` row is preserved in the DB for editorial workflows
  // (interview-detail review UI, suppression on reprocess) but must NOT
  // appear as an active edge in the operational graph or connections
  // panel. We treat `pending` and `approved` as active here, mirroring
  // the `ACTIVE_RELATIONSHIP_REVIEW_STATUSES` constant in
  // `src/types/database.ts`.
  const { data: relationships, error: relsError } = await admin
    .from("entity_relationships")
    .select("id, source_entity_id, target_entity_id, relation_type, confidence")
    .in("interview_id", interviewIds)
    .neq("review_status", "rejected");

  if (relsError) {
    return NextResponse.json({ error: relsError.message }, { status: 500 });
  }

  const entityIdSet = new Set(entityIds);

  const nodes: GraphNode[] = (entities ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    description: e.description,
    mentionCount: mentionCounts[e.id] ?? 0,
  }));

  // Only include edges where both endpoints are in this project's entity set
  const edges: GraphEdge[] = (relationships ?? [])
    .filter(
      (r) =>
        entityIdSet.has(r.source_entity_id) &&
        entityIdSet.has(r.target_entity_id)
    )
    .map((r) => ({
      id: r.id,
      source: r.source_entity_id,
      target: r.target_entity_id,
      relationType: r.relation_type,
      confidence: r.confidence,
    }));

  return NextResponse.json({ nodes, edges } satisfies GraphData);
}
