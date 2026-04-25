import { createAdminClient } from "@/lib/supabase/admin";
import type {
  EntityType,
  RelationType,
  RelationshipOrigin,
  RelationshipReviewStatus,
} from "@/types/database";

/**
 * Admin-side loader for the Relationships section of the Entity Governance
 * detail panel. Service-role only — call from a trusted server context that
 * has already enforced `hasEntityGovernanceAccess`.
 *
 * This is intentionally a separate loader from `loadGovernedEntityDetail`
 * (which only returns a count) and from `getRelationships` in
 * `src/lib/ai/entity-lookup.ts` (which is chat-oriented: filters out
 * `rejected` rows and omits the editorial metadata admins need).
 *
 * See docs/features/on-going/editable-relationship-governance.md
 * (Phase 2 — admin entity governance Relationships section).
 */

export const GOVERNANCE_RELATIONSHIPS_PAGE_SIZE = 25;

export type GovernanceRelationshipStatusFilter =
  | "all"
  | "active"
  | RelationshipReviewStatus;

export type GovernanceRelationshipDirectionFilter =
  | "all"
  | "incoming"
  | "outgoing";

export type GovernanceRelationshipDirection = "incoming" | "outgoing";

export type GovernanceRelationshipRow = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  source_entity_name: string;
  source_entity_type: EntityType;
  target_entity_name: string;
  target_entity_type: EntityType;
  relation_type: RelationType;
  confidence: number;
  evidence_text: string | null;
  interview_id: string;
  interview_title: string | null;
  review_status: RelationshipReviewStatus;
  origin: RelationshipOrigin;
  reviewed_at: string | null;
  reviewed_by: string | null;
  updated_at: string;
  /** Direction relative to the entity that was queried for. */
  direction: GovernanceRelationshipDirection;
  /** The entity on the OTHER side of the edge (i.e. not the queried entity). */
  related_entity_id: string;
  related_entity_name: string;
  related_entity_type: EntityType;
};

export type LoadRelationshipsForEntityArgs = {
  entityId: string;
  page?: number;
  pageSize?: number;
  statusFilter?: GovernanceRelationshipStatusFilter;
  directionFilter?: GovernanceRelationshipDirectionFilter;
};

export type LoadRelationshipsForEntityResult = {
  rows: GovernanceRelationshipRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawRelationshipRow = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: RelationType;
  confidence: number;
  evidence_text: string | null;
  interview_id: string;
  review_status: RelationshipReviewStatus;
  origin: RelationshipOrigin;
  reviewed_at: string | null;
  reviewed_by: string | null;
  updated_at: string;
};

type EntityLookupRow = {
  id: string;
  name: string;
  type: EntityType;
};

type InterviewLookupRow = {
  id: string;
  title: string | null;
};

/**
 * Load relationships connected to a single entity (incoming OR outgoing),
 * including editorially `rejected` rows so admins can review and restore
 * them.
 *
 * Filters:
 *   - statusFilter:
 *       "all"       → no filter
 *       "active"    → review_status IN ('pending', 'approved')
 *       "pending" | "approved" | "rejected" → exact match
 *   - directionFilter:
 *       "incoming"  → entity is the target
 *       "outgoing"  → entity is the source
 *       "all"       → both
 *
 * Pagination is applied at the DB level via PostgREST `.range`.
 */
export async function loadRelationshipsForEntity(
  args: LoadRelationshipsForEntityArgs
): Promise<LoadRelationshipsForEntityResult> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.max(1, args.pageSize ?? GOVERNANCE_RELATIONSHIPS_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const statusFilter: GovernanceRelationshipStatusFilter = args.statusFilter ?? "all";
  const directionFilter: GovernanceRelationshipDirectionFilter =
    args.directionFilter ?? "all";

  const empty: LoadRelationshipsForEntityResult = {
    rows: [],
    page,
    pageSize,
    totalCount: 0,
    totalPages: 1,
  };

  if (!UUID_RE.test(args.entityId)) {
    return empty;
  }

  const admin = createAdminClient();

  let query = admin
    .from("entity_relationships")
    .select(
      `
      id,
      source_entity_id,
      target_entity_id,
      relation_type,
      confidence,
      evidence_text,
      interview_id,
      review_status,
      origin,
      reviewed_at,
      reviewed_by,
      updated_at
    `,
      { count: "exact" }
    )
    .order("updated_at", { ascending: false });

  // Direction filter — DB level so pagination is honest
  if (directionFilter === "incoming") {
    query = query.eq("target_entity_id", args.entityId);
  } else if (directionFilter === "outgoing") {
    query = query.eq("source_entity_id", args.entityId);
  } else {
    const filterId = `eq.${args.entityId}`;
    query = query.or(
      `source_entity_id.${filterId},target_entity_id.${filterId}`
    );
  }

  // Status filter
  if (statusFilter === "active") {
    query = query.neq("review_status", "rejected");
  } else if (statusFilter !== "all") {
    query = query.eq("review_status", statusFilter);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error("loadRelationshipsForEntity:", error);
    return empty;
  }

  const rawRows = (data ?? []) as RawRelationshipRow[];
  if (rawRows.length === 0) {
    const totalCount = count ?? 0;
    return {
      rows: [],
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  }

  const entityIds = new Set<string>();
  const interviewIds = new Set<string>();
  for (const r of rawRows) {
    entityIds.add(r.source_entity_id);
    entityIds.add(r.target_entity_id);
    interviewIds.add(r.interview_id);
  }

  const [entitiesRes, interviewsRes] = await Promise.all([
    admin
      .from("entities")
      .select("id, name, type")
      .in("id", Array.from(entityIds)),
    admin
      .from("interviews")
      .select("id, title")
      .in("id", Array.from(interviewIds)),
  ]);

  if (entitiesRes.error) {
    console.error(
      "loadRelationshipsForEntity entities:",
      entitiesRes.error
    );
  }
  if (interviewsRes.error) {
    console.error(
      "loadRelationshipsForEntity interviews:",
      interviewsRes.error
    );
  }

  const entityMap = new Map<string, EntityLookupRow>();
  for (const e of (entitiesRes.data ?? []) as EntityLookupRow[]) {
    entityMap.set(e.id, e);
  }
  const interviewMap = new Map<string, InterviewLookupRow>();
  for (const i of (interviewsRes.data ?? []) as InterviewLookupRow[]) {
    interviewMap.set(i.id, i);
  }

  const rows: GovernanceRelationshipRow[] = rawRows.map((r) => {
    const source = entityMap.get(r.source_entity_id);
    const target = entityMap.get(r.target_entity_id);
    const interview = interviewMap.get(r.interview_id);
    const isOutgoing = r.source_entity_id === args.entityId;
    const direction: GovernanceRelationshipDirection = isOutgoing
      ? "outgoing"
      : "incoming";
    const related = isOutgoing ? target : source;
    const relatedId = isOutgoing ? r.target_entity_id : r.source_entity_id;
    return {
      id: r.id,
      source_entity_id: r.source_entity_id,
      target_entity_id: r.target_entity_id,
      source_entity_name: source?.name ?? "Unknown entity",
      source_entity_type: (source?.type ?? "ORGANIZATION") as EntityType,
      target_entity_name: target?.name ?? "Unknown entity",
      target_entity_type: (target?.type ?? "ORGANIZATION") as EntityType,
      relation_type: r.relation_type,
      confidence: r.confidence,
      evidence_text: r.evidence_text,
      interview_id: r.interview_id,
      interview_title: interview?.title ?? null,
      review_status: r.review_status,
      origin: r.origin,
      reviewed_at: r.reviewed_at,
      reviewed_by: r.reviewed_by,
      updated_at: r.updated_at,
      direction,
      related_entity_id: relatedId,
      related_entity_name: related?.name ?? "Unknown entity",
      related_entity_type: (related?.type ?? "ORGANIZATION") as EntityType,
    };
  });

  const totalCount = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    rows,
    page,
    pageSize,
    totalCount,
    totalPages,
  };
}
