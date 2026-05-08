// ============================================================
// Tenant settings — typed accessors (Phase 3a)
// ============================================================
// Provides typed helpers for reading tenant_settings rows.
// All keys within each JSONB column are validated here so the
// rest of the codebase never touches raw JSONB keys directly.
//
// Architecture decision: settings live in a single DB row per
// tenant with one JSONB column per category. Accessors provide
// typed defaults so missing keys are safe. No EAV anti-pattern.
//
// All reads use the admin client — settings are never
// user-visible in the UI (product roadmap may change this).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

// ── Settings shapes ────────────────────────────────────────────

export interface TenantLimits {
  max_sources?: number;
  max_users?: number;
  max_chat_messages_per_month?: number;
  max_reports?: number;
}

export interface TenantBranding {
  display_name?: string;
  logo_url?: string;
  primary_color?: string;
  email_sender_name?: string;
}

/** Feature flag map. A missing key is treated as disabled. */
export interface TenantFeatureFlags {
  reports?: boolean;
  war_room?: boolean;
  network_explorer?: boolean;
  copilot_web_search?: boolean;
  transcript_review?: boolean;
  entity_editor?: boolean;
  content_snippets?: boolean;
  [key: string]: boolean | undefined;
}

export interface TenantModuleConfig {
  extraction_model?: string;
  report_model?: string;
  chunk_size?: number;
  similarity_threshold?: number;
}

export interface TenantPromptConfig {
  copilot_persona?: string;
  extraction_hints?: string[];
  report_tone?: string;
}

export interface TenantSettings {
  id: string;
  tenant_id: string;
  limits: TenantLimits;
  branding: TenantBranding;
  feature_flags: TenantFeatureFlags;
  module_config: TenantModuleConfig;
  prompt_config: TenantPromptConfig;
  custom_schemas: Record<string, unknown>;
  auth_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Raw fetcher ────────────────────────────────────────────────

/**
 * Fetch the full `tenant_settings` row for the given tenant.
 * Returns well-typed defaults for every JSONB column so callers
 * never need to guard against missing keys.
 *
 * The result is not cached here — callers that need a TTL cache
 * should wrap this in their own in-memory or Next.js cache layer.
 */
export async function getTenantSettings(
  tenantId: string
): Promise<TenantSettings> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) {
    throw new Error(
      `[tenant] could not load settings for tenant ${tenantId}: ${error?.message ?? "not found"}`
    );
  }

  return {
    id: data.id as string,
    tenant_id: data.tenant_id as string,
    limits: (data.limits as TenantLimits) ?? {},
    branding: (data.branding as TenantBranding) ?? {},
    feature_flags: (data.feature_flags as TenantFeatureFlags) ?? {},
    module_config: (data.module_config as TenantModuleConfig) ?? {},
    prompt_config: (data.prompt_config as TenantPromptConfig) ?? {},
    custom_schemas: (data.custom_schemas as Record<string, unknown>) ?? {},
    auth_config: (data.auth_config as Record<string, unknown>) ?? {},
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

// ── Convenience accessors ──────────────────────────────────────

/**
 * Returns true if the feature flag is explicitly enabled for this tenant.
 * A missing key is treated as disabled (safe default).
 */
export async function isFeatureEnabled(
  tenantId: string,
  flag: keyof TenantFeatureFlags
): Promise<boolean> {
  const settings = await getTenantSettings(tenantId);
  return settings.feature_flags[flag] === true;
}

/**
 * Returns the limits configured for this tenant with sensible
 * platform defaults for any key that is not explicitly set.
 */
export async function getTenantLimits(tenantId: string): Promise<Required<TenantLimits>> {
  const settings = await getTenantSettings(tenantId);
  return {
    max_sources: settings.limits.max_sources ?? 10_000,
    max_users: settings.limits.max_users ?? 50,
    max_chat_messages_per_month: settings.limits.max_chat_messages_per_month ?? 5_000,
    max_reports: settings.limits.max_reports ?? 1_000,
  };
}

/**
 * Returns the module configuration for this tenant with platform defaults.
 * The pipeline uses this to allow per-tenant model or threshold overrides.
 */
export async function getTenantModuleConfig(
  tenantId: string
): Promise<Required<TenantModuleConfig>> {
  const settings = await getTenantSettings(tenantId);
  return {
    extraction_model: settings.module_config.extraction_model ?? "gpt-4o-mini",
    report_model: settings.module_config.report_model ?? "gpt-4o",
    chunk_size: settings.module_config.chunk_size ?? 500,
    similarity_threshold: settings.module_config.similarity_threshold ?? 0.25,
  };
}

/**
 * Returns the prompt / workflow config for this tenant.
 * Used by the pipeline and the Copilot system prompt builder.
 */
export async function getTenantPromptConfig(tenantId: string): Promise<TenantPromptConfig> {
  const settings = await getTenantSettings(tenantId);
  return settings.prompt_config;
}
