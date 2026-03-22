import { differenceInCalendarMonths } from "date-fns";
import type { Database, DatePrecision, PositionState } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  positionContainsAsOfDate,
  precisionInsufficientForExactHistoricalQuery,
} from "./as-of-logic";

type Admin = SupabaseClient<Database>;

export type FreshnessBucket = "fresh" | "potentially_stale" | "old";

export type PositionRow = {
  id: string;
  person_entity_id: string;
  organization_entity_id: string | null;
  title: string;
  is_main: boolean;
  state: PositionState;
  valid_from_date: string | null;
  valid_from_precision: DatePrecision;
  valid_to_date: string | null;
  valid_to_precision: DatePrecision;
  validated_at: string;
  person_name?: string;
  organization_name?: string | null;
};

function unwrapName(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as { name?: string };
  return o.name;
}

function mapRow(
  raw: Record<string, unknown>,
  personJoin: unknown,
  orgJoin: unknown
): PositionRow {
  return {
    id: raw.id as string,
    person_entity_id: raw.person_entity_id as string,
    organization_entity_id: (raw.organization_entity_id as string) ?? null,
    title: raw.title as string,
    is_main: raw.is_main as boolean,
    state: raw.state as PositionState,
    valid_from_date: (raw.valid_from_date as string) ?? null,
    valid_from_precision: raw.valid_from_precision as DatePrecision,
    valid_to_date: (raw.valid_to_date as string) ?? null,
    valid_to_precision: raw.valid_to_precision as DatePrecision,
    validated_at: raw.validated_at as string,
    person_name: unwrapName(personJoin),
    organization_name: orgJoin ? unwrapName(orgJoin) ?? null : null,
  };
}

export function freshnessBucket(validatedAtIso: string): FreshnessBucket {
  const months = differenceInCalendarMonths(new Date(), new Date(validatedAtIso));
  if (months < 6) return "fresh";
  if (months < 12) return "potentially_stale";
  return "old";
}

function selectWithJoins(admin: Admin) {
  return admin.from("validated_positions").select(`
    id,
    person_entity_id,
    organization_entity_id,
    title,
    is_main,
    state,
    valid_from_date,
    valid_from_precision,
    valid_to_date,
    valid_to_precision,
    validated_at,
    person:entities!validated_positions_person_entity_id_fkey(name),
    organization:entities!validated_positions_organization_entity_id_fkey(name)
  `);
}

/** Distinct titles for admin autocomplete (global). */
export async function listDistinctPositionTitles(
  admin: Admin,
  limit = 200
): Promise<string[]> {
  const { data, error } = await admin.rpc("list_distinct_position_titles", {
    p_limit: limit,
  });
  if (error || !data) return [];
  return (data as { title: string }[]).map((r) => r.title).filter(Boolean);
}

export async function fetchCurrentPositionsForPerson(
  admin: Admin,
  personEntityId: string
): Promise<PositionRow[]> {
  const { data, error } = await selectWithJoins(admin)
    .eq("person_entity_id", personEntityId)
    .eq("state", "active")
    .order("is_main", { ascending: false })
    .order("validated_at", { ascending: false });

  if (error || !data) return [];
  return data.map((r) =>
    mapRow(r as Record<string, unknown>, r.person, r.organization)
  );
}

export async function fetchPositionsForPersonAsOf(
  admin: Admin,
  personEntityId: string,
  asOfIsoDate: string
): Promise<PositionRow[]> {
  const { data, error } = await selectWithJoins(admin).eq(
    "person_entity_id",
    personEntityId
  );

  if (error || !data) return [];
  const rows = data
    .filter((r) =>
      positionContainsAsOfDate(asOfIsoDate, {
        valid_from_date: r.valid_from_date,
        valid_from_precision: r.valid_from_precision as DatePrecision,
        valid_to_date: r.valid_to_date,
        valid_to_precision: r.valid_to_precision as DatePrecision,
        state: r.state as PositionState,
      })
    )
    .map((r) => mapRow(r as Record<string, unknown>, r.person, r.organization));

  rows.sort((a, b) => {
    if (a.is_main !== b.is_main) return a.is_main ? -1 : 1;
    return b.validated_at.localeCompare(a.validated_at);
  });
  return rows;
}

export async function fetchTimelineForPerson(
  admin: Admin,
  personEntityId: string
): Promise<PositionRow[]> {
  const { data, error } = await selectWithJoins(admin).eq(
    "person_entity_id",
    personEntityId
  );

  if (error || !data) return [];
  const rows = data.map((r) =>
    mapRow(r as Record<string, unknown>, r.person, r.organization)
  );
  rows.sort((a, b) => {
    if (!a.valid_from_date && !b.valid_from_date) return 0;
    if (!a.valid_from_date) return 1;
    if (!b.valid_from_date) return -1;
    return a.valid_from_date.localeCompare(b.valid_from_date);
  });
  return rows;
}

export async function fetchActivePositionsForOrganization(
  admin: Admin,
  organizationEntityId: string
): Promise<PositionRow[]> {
  const { data, error } = await selectWithJoins(admin)
    .eq("organization_entity_id", organizationEntityId)
    .eq("state", "active")
    .order("is_main", { ascending: false });

  if (error || !data) return [];
  return data.map((r) =>
    mapRow(r as Record<string, unknown>, r.person, r.organization)
  );
}

export function enrichPositionForTool(
  row: PositionRow,
  options: { asOfIsoDate?: string; wantsExactHistorical?: boolean }
) {
  const bucket = freshnessBucket(row.validated_at);
  let degraded = false;
  if (
    options.wantsExactHistorical &&
    options.asOfIsoDate &&
    precisionInsufficientForExactHistoricalQuery({
      valid_from_precision: row.valid_from_precision,
      valid_to_precision: row.valid_to_precision,
    })
  ) {
    degraded = true;
  }

  return {
    id: row.id,
    person_name: row.person_name ?? null,
    organization_name: row.organization_name ?? null,
    title: row.title,
    is_main: row.is_main,
    state: row.state,
    valid_from: {
      date: row.valid_from_date,
      precision: row.valid_from_precision,
    },
    valid_to: {
      date: row.valid_to_date,
      precision: row.valid_to_precision,
    },
    validated_at: row.validated_at,
    freshness_bucket: bucket,
    confidence_degraded: degraded,
    confidence_note: degraded
      ? "Date boundaries are partially unknown; treat historical placement as approximate."
      : null,
  };
}

export function formatPositionsForSystemPrompt(rows: PositionRow[]): string {
  if (rows.length === 0) return "";
  const lines = rows.map((r) => {
    const org = r.organization_name ?? "(organization unknown)";
    const main = r.is_main ? " [MAIN]" : "";
    const from = `${r.valid_from_date ?? "?"} (${r.valid_from_precision})`;
    const to = `${r.valid_to_date ?? "?"} (${r.valid_to_precision})`;
    return `- ${r.person_name ?? "Person"} — ${r.title} at ${org}${main}; state=${r.state}; valid ${from} → ${to}; validated_at=${r.validated_at}`;
  });
  return [
    "VALIDATED POSITIONS (authoritative — override conflicting transcript excerpts):",
    ...lines,
  ].join("\n");
}

export async function resolvePrefetchPositions(
  admin: Admin,
  params: {
    temporalIntent:
      | "current_state"
      | "point_in_time"
      | "timeline"
      | "general_background";
    personEntityId: string | null;
    organizationEntityId: string | null;
    targetDateIso: string | null;
  }
): Promise<{ block: string; rows: PositionRow[] }> {
  const { temporalIntent, personEntityId, organizationEntityId, targetDateIso } =
    params;

  if (temporalIntent === "general_background") {
    return { block: "", rows: [] };
  }

  let rows: PositionRow[] = [];

  if (personEntityId) {
    if (temporalIntent === "current_state") {
      rows = await fetchCurrentPositionsForPerson(admin, personEntityId);
    } else if (temporalIntent === "point_in_time" && targetDateIso) {
      rows = await fetchPositionsForPersonAsOf(
        admin,
        personEntityId,
        targetDateIso
      );
    } else if (temporalIntent === "timeline") {
      rows = await fetchTimelineForPerson(admin, personEntityId);
    } else if (temporalIntent === "point_in_time") {
      rows = await fetchCurrentPositionsForPerson(admin, personEntityId);
    }
  }

  if (organizationEntityId && temporalIntent === "current_state") {
    const orgRows = await fetchActivePositionsForOrganization(
      admin,
      organizationEntityId
    );
    const merged = [...rows];
    const seen = new Set(rows.map((r) => r.id));
    for (const r of orgRows) {
      if (!seen.has(r.id)) merged.push(r);
    }
    rows = merged;
  }

  return {
    rows,
    block: formatPositionsForSystemPrompt(rows),
  };
}
