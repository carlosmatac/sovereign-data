import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GraphNode, GraphEdge } from "@/app/api/graph/[projectId]/route";
import {
  fetchContextualAssociations,
  type ContextualAssociation,
} from "@/lib/entities/contextual-associations";

export type { ContextualAssociation };

export interface EntityWithMeta extends GraphNode {
  metadata?: unknown;
}

export interface NeighborhoodData {
  entity: EntityWithMeta;
  relationships: GraphEdge[];
  neighbors: GraphNode[];
  contextualAssociations: ContextualAssociation[];
}

/**
 * GET /api/graph/entity/[entityId]
 *
 * Returns a single entity with all its relationships and neighbour entities.
 * Tenant-scoped: the calling user must be a member of at least one project
 * that the entity belongs to (via project_members).
 * Excludes rejected relationships.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify the user has access to at least one project the entity is in.
  // Entities are scoped to a project via the project_id column.
  const { data: entityRow, error: entityError } = await admin
    .from("entities")
    .select("id, name, type, description, metadata, project_id, tenant_id")
    .eq("id", entityId)
    .is("canonical_entity_id", null)
    .single();

  if (entityError || !entityRow) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  // Auth check: user must be a member of the project (or the entity's tenant)
  if (entityRow.project_id) {
    const { data: membership } = await admin
      .from("project_members")
      .select("role")
      .eq("project_id", entityRow.project_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (entityRow.tenant_id) {
    // Global entity — verify user belongs to the same tenant via tenant_members
    const { data: membership } = await admin
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("tenant_id", entityRow.tenant_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Fetch all relationships where this entity is source or target
  const [{ data: asSource }, { data: asTarget }] = await Promise.all([
    admin
      .from("entity_relationships")
      .select("id, source_entity_id, target_entity_id, relation_type, confidence")
      .eq("source_entity_id", entityId)
      .neq("review_status", "rejected"),
    admin
      .from("entity_relationships")
      .select("id, source_entity_id, target_entity_id, relation_type, confidence")
      .eq("target_entity_id", entityId)
      .neq("review_status", "rejected"),
  ]);

  const relationships: GraphEdge[] = [
    ...(asSource ?? []),
    ...(asTarget ?? []),
  ].map((r) => ({
    id: r.id,
    source: r.source_entity_id,
    target: r.target_entity_id,
    relationType: r.relation_type,
    confidence: r.confidence,
  }));

  // Collect neighbour IDs (semantic + contextual)
  const neighbourIds = new Set<string>();
  for (const r of relationships) {
    if (r.source !== entityId) neighbourIds.add(r.source);
    if (r.target !== entityId) neighbourIds.add(r.target);
  }

  const contextualAssociations = await fetchContextualAssociations(admin, entityId, {
    projectId: entityRow.project_id,
  });

  for (const assoc of contextualAssociations) {
    neighbourIds.add(assoc.entity.id);
  }

  // Fetch neighbour entities
  let neighbors: GraphNode[] = [];
  if (neighbourIds.size > 0) {
    const { data: neighbourRows } = await admin
      .from("entities")
      .select("id, name, type, description")
      .in("id", Array.from(neighbourIds));

    neighbors = (neighbourRows ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
      mentionCount: 0,
    }));
  }

  const entity: EntityWithMeta = {
    id: entityRow.id,
    name: entityRow.name,
    type: entityRow.type,
    description: entityRow.description,
    mentionCount: 0,
    metadata: entityRow.metadata,
  };

  return NextResponse.json({
    entity,
    relationships,
    neighbors,
    contextualAssociations,
  } satisfies NeighborhoodData);
}
