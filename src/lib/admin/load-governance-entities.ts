import { createAdminClient } from "@/lib/supabase/admin";
import type { EntityType } from "@/types/database";

export const GOVERNANCE_ENTITIES_PAGE_SIZE = 25;

export const GOVERNANCE_ALIAS_PREVIEW_LIMIT = 75;

export type GovernanceEntityListRow = {
  id: string;
  name: string;
  type: EntityType;
  project_id: string | null;
  normalized_name: string;
  description: string | null;
  updated_at: string;
  alias_count: number;
  mention_count: number;
  project_name: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENTITY_TYPES: EntityType[] = [
  "PERSON",
  "COMPANY",
  "GOVERNMENT",
  "ORGANIZATION",
  "LOCATION",
  "EVENT",
];

function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseNestedCount(value: unknown): number {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as { count?: number };
    return typeof first.count === "number" ? first.count : 0;
  }
  if (value && typeof value === "object" && "count" in value) {
    const c = (value as { count: unknown }).count;
    return typeof c === "number" ? c : 0;
  }
  return 0;
}

type RawGovernanceRow = {
  id: string;
  name: string;
  type: EntityType;
  project_id: string | null;
  normalized_name: string;
  description: string | null;
  updated_at: string;
  entity_aliases: unknown;
  entity_mentions: unknown;
  projects: { name: string } | null;
};

/**
 * Canonical entities only (`canonical_entity_id` IS NULL), for operator governance.
 * Uses service role — call only from trusted server code after entity-governance auth.
 */
export async function loadGovernanceEntitiesList(args: {
  page: number;
  q: string;
  typeFilter: string;
  scope: string;
  projectId: string;
}): Promise<{
  rows: GovernanceEntityListRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}> {
  const admin = createAdminClient();
  const page = Math.max(1, args.page);
  const pageSize = GOVERNANCE_ENTITIES_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from("entities")
    .select(
      `
      id,
      name,
      type,
      project_id,
      normalized_name,
      description,
      updated_at,
      entity_aliases ( count ),
      entity_mentions ( count ),
      projects ( name )
    `,
      { count: "exact" }
    )
    .is("canonical_entity_id", null)
    .order("updated_at", { ascending: false });

  const q = args.q.trim();
  if (q) {
    const inner = escapeIlikePattern(q).replace(/"/g, '\\"');
    const pat = `%${inner}%`;
    query = query.or(
      `name.ilike."${pat}",normalized_name.ilike."${pat}"`
    );
  }

  const typeOk = ENTITY_TYPES.includes(args.typeFilter as EntityType);
  if (typeOk) {
    query = query.eq("type", args.typeFilter as EntityType);
  }

  if (args.scope === "global") {
    query = query.is("project_id", null);
  } else if (args.scope === "project" && UUID_RE.test(args.projectId)) {
    query = query.eq("project_id", args.projectId);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error("loadGovernanceEntitiesList:", error);
    throw new Error(error.message);
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const rows: GovernanceEntityListRow[] = (data ?? []).map((row) => {
    const r = row as RawGovernanceRow;
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      project_id: r.project_id,
      normalized_name: r.normalized_name,
      description: r.description,
      updated_at: r.updated_at,
      alias_count: parseNestedCount(r.entity_aliases),
      mention_count: parseNestedCount(r.entity_mentions),
      project_name: r.projects?.name ?? null,
    };
  });

  return {
    rows,
    page,
    pageSize,
    totalCount,
    totalPages,
  };
}

export async function loadProjectsForGovernanceFilter(): Promise<
  { id: string; name: string }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("id, name")
    .order("name");

  if (error) {
    console.error("loadProjectsForGovernanceFilter:", error);
    return [];
  }

  return data ?? [];
}

export type GovernanceEntityAliasRow = {
  id: string;
  alias: string;
  alias_normalized: string;
  source: string | null;
  project_id: string | null;
};

export type GovernanceEntityDetail = {
  id: string;
  name: string;
  type: EntityType;
  project_id: string | null;
  canonical_entity_id: string | null;
  normalized_name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
  project_name: string | null;
  alias_count: number;
  mention_count: number;
  relationship_count: number;
  /** Preview rows (capped); use `alias_count` for totals. */
  aliases_preview: GovernanceEntityAliasRow[];
  canonical_target: { id: string; name: string } | null;
};

type EntityBaseRow = {
  id: string;
  name: string;
  type: EntityType;
  project_id: string | null;
  canonical_entity_id: string | null;
  normalized_name: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
  projects: { name: string } | null;
};

export type LoadGovernedEntityDetailResult =
  | { ok: true; entity: GovernanceEntityDetail }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "error"; message: string };

/**
 * Loads one entity using small queries (no nested self-join embeds that can break PostgREST).
 * Never throws — callers render UI from the discriminated result.
 */
export async function loadGovernedEntityDetail(
  entityId: string
): Promise<LoadGovernedEntityDetailResult> {
  const admin = createAdminClient();

  const { data: row, error: baseError } = await admin
    .from("entities")
    .select(
      `
      id,
      name,
      type,
      project_id,
      canonical_entity_id,
      normalized_name,
      description,
      metadata,
      updated_at,
      projects ( name )
    `
    )
    .eq("id", entityId)
    .maybeSingle();

  if (baseError) {
    console.error("loadGovernedEntityDetail base:", baseError);
    return { ok: false, reason: "error", message: baseError.message };
  }
  if (!row) {
    return { ok: false, reason: "not_found" };
  }

  const base = row as unknown as EntityBaseRow;

  let canonical_target: { id: string; name: string } | null = null;
  if (base.canonical_entity_id) {
    const { data: canon, error: canonError } = await admin
      .from("entities")
      .select("id, name")
      .eq("id", base.canonical_entity_id)
      .maybeSingle();
    if (canonError) {
      console.error("loadGovernedEntityDetail canonical:", canonError);
    } else if (canon) {
      canonical_target = canon;
    }
  }

  const filterId = `eq.${entityId}`;

  const [
    aliasCountRes,
    mentionCountRes,
    relationshipCountRes,
    aliasesListRes,
  ] = await Promise.all([
    admin
      .from("entity_aliases")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", entityId),
    admin
      .from("entity_mentions")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", entityId),
    admin
      .from("entity_relationships")
      .select("id", { count: "exact", head: true })
      .or(`source_entity_id.${filterId},target_entity_id.${filterId}`),
    admin
      .from("entity_aliases")
      .select("id, alias, alias_normalized, source, project_id")
      .eq("entity_id", entityId)
      .order("alias", { ascending: true })
      .limit(GOVERNANCE_ALIAS_PREVIEW_LIMIT),
  ]);

  if (aliasCountRes.error) {
    console.error("loadGovernedEntityDetail alias count:", aliasCountRes.error);
  }
  if (mentionCountRes.error) {
    console.error(
      "loadGovernedEntityDetail mention count:",
      mentionCountRes.error
    );
  }
  if (relationshipCountRes.error) {
    console.error(
      "loadGovernedEntityDetail relationship count:",
      relationshipCountRes.error
    );
  }
  if (aliasesListRes.error) {
    console.error("loadGovernedEntityDetail alias list:", aliasesListRes.error);
  }

  const entity: GovernanceEntityDetail = {
    id: base.id,
    name: base.name,
    type: base.type,
    project_id: base.project_id,
    canonical_entity_id: base.canonical_entity_id,
    normalized_name: base.normalized_name,
    description: base.description,
    metadata: base.metadata ?? {},
    updated_at: base.updated_at,
    project_name: base.projects?.name ?? null,
    alias_count: aliasCountRes.count ?? 0,
    mention_count: mentionCountRes.count ?? 0,
    relationship_count: relationshipCountRes.count ?? 0,
    aliases_preview: (aliasesListRes.data ?? []) as GovernanceEntityAliasRow[],
    canonical_target,
  };

  return { ok: true, entity };
}
