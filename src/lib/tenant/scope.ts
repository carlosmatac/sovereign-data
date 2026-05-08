// ============================================================
// Tenant scope helpers (Phase 3a)
// ============================================================
// Lightweight utilities for resolving tenant_id at pipeline
// entry points. All pipeline writes use the admin client and
// call these helpers once at the top of the runner to avoid
// per-row round-trips.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Resolve the `tenant_id` for a source row.
 *
 * Called once at the top of `runIntelPipelineFromCanonicalSource`
 * (and callers that need it before the runner). Throws if the
 * source is not found — callers should let the error propagate
 * so the pipeline marks the source as FAILED.
 */
export async function getSourceTenantId(
  supabase: SupabaseClient<Database>,
  sourceId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("sources")
    .select("tenant_id")
    .eq("id", sourceId)
    .single();

  if (error || !data) {
    throw new Error(`[tenant] could not resolve tenant_id for source ${sourceId}: ${error?.message ?? "not found"}`);
  }

  return data.tenant_id as string;
}

/**
 * Resolve the `tenant_id` for a project row.
 *
 * Used by route handlers that create sources (the source inherits
 * the project's tenant) and by read paths scoping by tenant.
 */
export async function getProjectTenantId(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .single();

  if (error || !data) {
    throw new Error(`[tenant] could not resolve tenant_id for project ${projectId}: ${error?.message ?? "not found"}`);
  }

  return data.tenant_id as string;
}
