/**
 * Source-entity aggregator — unified entity list for a single source.
 *
 * Merges `source_entities` (anchor + extraction rows) with `entity_mentions`
 * (chunk-level mentions) into a single deduplicated, sorted, labelled list.
 *
 * Used by:
 *  - Source Detail page  (/interviews/[id])
 *  - Transcript Review page (/interviews/[id]/review)
 *
 * Requires an admin client — `source_entities` RLS blocks the user client on
 * direct page-data query paths (same reason as the existing review page code).
 *
 * Spec: docs/features/on-going/source-all-related-entities-panel.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// ── Public type ──────────────────────────────────────────────────────────────

export type SourceEntityItem = {
  entityId: string;
  name: string;
  type: string;
  description: string | null;
  /**
   * Human-readable role label: "Interviewee", "Organization", "Participant",
   * "Primary Subject", "Author", "Extracted", "Mentioned", or a humanized
   * form of the link_type for future/unknown values.
   */
  roleLabel: string;
  /** Source-scoped context from source_entities.context (null for mention-only rows). */
  context: string | null;
  /**
   * Controls display ordering — lower = shown higher.
   *   1  interviewee anchor
   *   2  interviewee_org anchor
   *   3  participant anchor
   *   4  other anchor origin
   *   5  source_entities extraction origin
   *   6  entity_mentions only
   */
  sortOrder: number;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

const LINK_TYPE_LABEL: Record<string, string> = {
  interviewee: "Interviewee",
  interviewee_org: "Organization",
  participant: "Participant",
  primary_subject: "Primary Subject",
  author: "Author",
  subject_organization: "Organization",
};

const ANCHOR_SORT: Record<string, number> = {
  interviewee: 1,
  interviewee_org: 2,
  participant: 3,
};

const ANCHOR_ORIGINS = new Set([
  "upload_anchor",
  "metadata_import",
  "manual_tag",
  "human_review",
]);

function humanizeLinkType(linkType: string): string {
  return (
    LINK_TYPE_LABEL[linkType] ??
    linkType
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function sortOrderForSourceEntity(linkType: string, origin: string): number {
  if (ANCHOR_ORIGINS.has(origin)) {
    return ANCHOR_SORT[linkType] ?? 4;
  }
  return 5;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Returns a deduplicated, sorted, role-labelled list of all entities related
 * to `sourceId` — merging `source_entities` and `entity_mentions`.
 *
 * Deduplication rule: when an entity appears in both tables, the
 * `source_entities` row wins (higher-priority role label, carries context).
 *
 * When the same entity has multiple `source_entities` rows with different
 * `link_type` values (e.g. future multi-participant sources), the row with the
 * lowest sortOrder is kept — no duplicate entries per entity.
 */
export async function getSourceEntityItems(
  admin: SupabaseClient<Database>,
  sourceId: string
): Promise<SourceEntityItem[]> {
  const [seRes, emRes] = await Promise.all([
    admin
      .from("source_entities")
      .select("entity_id, link_type, origin, context, entities(id, name, type, description)")
      .eq("source_id", sourceId),
    admin
      .from("entity_mentions")
      .select("entity_id, entities(id, name, type, description)")
      .eq("interview_id", sourceId),
  ]);

  if (seRes.error) {
    console.error(
      "[source-entity-aggregator] source_entities fetch failed:",
      seRes.error
    );
  }
  if (emRes.error) {
    console.error(
      "[source-entity-aggregator] entity_mentions fetch failed:",
      emRes.error
    );
  }

  const items = new Map<string, SourceEntityItem>();

  // ── 1. source_entities — highest priority ──────────────────────────────────
  for (const row of seRes.data ?? []) {
    const ed = normalizeEntityJoin(row.entities);
    if (!ed) continue;

    const linkType = (row.link_type as string | null) ?? "";
    const origin = (row.origin as string | null) ?? "";
    const sortOrder = sortOrderForSourceEntity(linkType, origin);

    const existing = items.get(row.entity_id);
    if (existing && existing.sortOrder <= sortOrder) continue; // keep better-priority row

    items.set(row.entity_id, {
      entityId: row.entity_id,
      name: ed.name,
      type: ed.type,
      description: ed.description,
      roleLabel: humanizeLinkType(linkType) || "Extracted",
      context: (row.context as string | null) ?? null,
      sortOrder,
    });
  }

  // ── 2. entity_mentions — only for entities not already in source_entities ──
  const seenMentionIds = new Set<string>();
  for (const row of emRes.data ?? []) {
    if (!row.entity_id) continue;
    if (items.has(row.entity_id)) continue;     // covered by source_entities
    if (seenMentionIds.has(row.entity_id)) continue; // dedup within mentions
    seenMentionIds.add(row.entity_id);

    const ed = normalizeEntityJoin(row.entities);
    if (!ed) continue;

    items.set(row.entity_id, {
      entityId: row.entity_id,
      name: ed.name,
      type: ed.type,
      description: ed.description,
      roleLabel: "Mentioned",
      context: null,
      sortOrder: 6,
    });
  }

  return Array.from(items.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

type EntityJoin =
  | { id: string; name: string; type: string; description: string | null }
  | Array<{ id: string; name: string; type: string; description: string | null }>
  | null;

function normalizeEntityJoin(
  raw: EntityJoin
): { id: string; name: string; type: string; description: string | null } | null {
  const entity = Array.isArray(raw) ? raw[0] : raw;
  if (!entity || typeof entity.name !== "string") return null;
  return entity;
}
