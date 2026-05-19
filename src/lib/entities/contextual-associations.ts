/**
 * Contextual associations — entities that co-appear in the same source
 * (via source_entities) without a persisted semantic relationship.
 *
 * Phase 4 of entity-relationship-extraction: retrieval/UI layer only;
 * no weak semantic edges are written to entity_relationships.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import type { GraphNode } from "@/app/api/graph/[projectId]/route";
import type { SourceEntityLinkType } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ContextualAssociation {
  entity: GraphNode;
  sourceId: string;
  sourceTitle: string;
  conductedAt: string | null;
  linkTypes: string[];
}

type SourceEntityRow = {
  source_id: string;
  entity_id: string;
  link_type: SourceEntityLinkType;
  sources: { id: string; title: string; conducted_at: string | null; project_id: string } | null;
};

type EntityRow = {
  id: string;
  name: string;
  type: string;
  description: string | null;
};

/**
 * Fetch co-occurrence associations for a focal entity: other entities that
 * appear in the same sources (source_entities), scoped to accessible projects.
 */
export async function fetchContextualAssociations(
  admin: AdminClient,
  entityId: string,
  options?: { projectId?: string | null; limit?: number }
): Promise<ContextualAssociation[]> {
  const limit = options?.limit ?? 200;

  const { data: focalRows, error: focalError } = await admin
    .from("source_entities")
    .select("source_id")
    .eq("entity_id", entityId);

  if (focalError || !focalRows?.length) return [];

  const sourceIds = [...new Set(focalRows.map((r) => r.source_id))];
  if (sourceIds.length === 0) return [];

  const { data: coRows, error: coError } = await admin
    .from("source_entities")
    .select(
      "source_id, entity_id, link_type, sources!source_entities_source_id_fkey(id, title, conducted_at, project_id)"
    )
    .in("source_id", sourceIds)
    .neq("entity_id", entityId)
    .limit(limit * 3);
  if (coError || !coRows?.length) return [];

  const typedRows = coRows as unknown as SourceEntityRow[];
  const entityIds = [...new Set(typedRows.map((r) => r.entity_id))];

  const { data: entityRows } = await admin
    .from("entities")
    .select("id, name, type, description")
    .in("id", entityIds)
    .is("canonical_entity_id", null);

  const entityById = new Map<string, EntityRow>(
    (entityRows ?? []).map((e) => [e.id, e as EntityRow])
  );

  // Aggregate by (entity_id, source_id)
  const grouped = new Map<
    string,
    {
      entityId: string;
      sourceId: string;
      sourceTitle: string;
      conductedAt: string | null;
      linkTypes: Set<string>;
    }
  >();

  for (const row of typedRows) {
    const source = row.sources;
    if (!source?.title) continue;
    if (options?.projectId && source.project_id !== options.projectId) continue;

    const key = `${row.entity_id}::${row.source_id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.linkTypes.add(row.link_type);
      continue;
    }
    grouped.set(key, {
      entityId: row.entity_id,
      sourceId: row.source_id,
      sourceTitle: source.title,
      conductedAt: source.conducted_at,
      linkTypes: new Set([row.link_type]),
    });
  }

  const out: ContextualAssociation[] = [];
  for (const g of grouped.values()) {
    const ent = entityById.get(g.entityId);
    if (!ent) continue;
    out.push({
      entity: {
        id: ent.id,
        name: ent.name,
        type: ent.type,
        description: ent.description,
        mentionCount: 0,
      },
      sourceId: g.sourceId,
      sourceTitle: g.sourceTitle,
      conductedAt: g.conductedAt,
      linkTypes: [...g.linkTypes].sort(),
    });
    if (out.length >= limit) break;
  }

  out.sort((a, b) => {
    const ta = a.conductedAt ?? "";
    const tb = b.conductedAt ?? "";
    return tb.localeCompare(ta) || a.sourceTitle.localeCompare(b.sourceTitle);
  });

  return out;
}

/** Group co-occurrences by source for Copilot tool output. */
export function groupCoOccurrencesBySource(
  associations: ContextualAssociation[]
): Array<{
  sourceId: string;
  sourceTitle: string;
  entities: Array<{ name: string; type: string; linkTypes: string[] }>;
}> {
  const bySource = new Map<
    string,
    {
      sourceTitle: string;
      entities: Map<string, { name: string; type: string; linkTypes: Set<string> }>;
    }
  >();

  for (const a of associations) {
    let bucket = bySource.get(a.sourceId);
    if (!bucket) {
      bucket = { sourceTitle: a.sourceTitle, entities: new Map() };
      bySource.set(a.sourceId, bucket);
    }
    const entKey = a.entity.id;
    const existing = bucket.entities.get(entKey);
    if (existing) {
      for (const lt of a.linkTypes) existing.linkTypes.add(lt);
    } else {
      bucket.entities.set(entKey, {
        name: a.entity.name,
        type: a.entity.type,
        linkTypes: new Set(a.linkTypes),
      });
    }
  }

  return [...bySource.entries()].map(([sourceId, bucket]) => ({
    sourceId,
    sourceTitle: bucket.sourceTitle,
    entities: [...bucket.entities.values()].map((e) => ({
      name: e.name,
      type: e.type,
      linkTypes: [...e.linkTypes].sort(),
    })),
  }));
}

/**
 * Human-readable block for the Copilot system/tool context.
 * Clearly labelled so the model can distinguish from semantic relationships.
 */
export function formatSourceCoOccurrenceContext(
  entityName: string,
  associations: ContextualAssociation[]
): string | null {
  if (associations.length === 0) return null;

  const grouped = groupCoOccurrencesBySource(associations);
  const lines: string[] = [
    "SOURCE CO-OCCURRENCE CONTEXT (not explicit relationship claims — entities tagged in the same source):",
    `Other entities that appeared alongside "${entityName}" in the same sources:`,
  ];

  for (const src of grouped.slice(0, 12)) {
    const entityList = src.entities
      .slice(0, 8)
      .map((e) => `${e.name} (${e.type}${e.linkTypes.length ? `; ${e.linkTypes.join(", ")}` : ""})`)
      .join("; ");
    lines.push(`- "${src.sourceTitle}": ${entityList}`);
  }

  if (grouped.length > 12) {
    lines.push(`- …and ${grouped.length - 12} more source(s)`);
  }

  return lines.join("\n");
}
