-- ============================================================
-- Phase 3a / PR 3a.1 — Core tenancy tables
-- ============================================================
-- Creates tenants, tenant_members, tenant_settings, and
-- tenant_integrations. Adds the is_tenant_member() SECURITY
-- DEFINER helper. Bootstraps one tenant row + settings row
-- for the current (sole) customer.
--
-- No existing tables are touched in this migration.
-- All compound FK additions and backfills are in 00033.
-- All RLS policies are in 00034.
-- ============================================================

-- ── 1. tenants ───────────────────────────────────────────────
CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. tenant_members ────────────────────────────────────────
-- Compound PK: (tenant_id, user_id) — membership is intrinsically tenant-scoped.
CREATE TABLE tenant_members (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member'
             CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

-- ── 3. tenant_settings ───────────────────────────────────────
-- One row per tenant. All config JSONB with safe empty defaults.
CREATE TABLE tenant_settings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  -- Hard limits per tenant (max_sources, max_users, etc.)
  limits         JSONB NOT NULL DEFAULT '{}',
  -- Branding overrides (logo_url, primary_color, display_name, etc.)
  branding       JSONB NOT NULL DEFAULT '{}',
  -- Feature flag map: { "reports": true, "war_room": false, ... }
  feature_flags  JSONB NOT NULL DEFAULT '{}',
  -- Module-level config: { "extraction_model": "gpt-4o", "chunk_size": 800 }
  module_config  JSONB NOT NULL DEFAULT '{}',
  -- Prompt / workflow overrides: { "copilot_persona": "...", "extraction_hints": [...] }
  prompt_config  JSONB NOT NULL DEFAULT '{}',
  -- Custom field schemas per object type: { "source": [...], "entity": [...] }
  custom_schemas JSONB NOT NULL DEFAULT '{}',
  -- Auth config: { "sso_provider": "...", "allowed_domains": [...] }
  auth_config    JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. tenant_integrations ───────────────────────────────────
-- One row per (tenant, integration_type). Credentials stored by
-- reference only — never plaintext in this table.
CREATE TABLE tenant_integrations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT false,
  -- Non-sensitive integration config (endpoint URLs, field mappings, etc.)
  config           JSONB NOT NULL DEFAULT '{}',
  -- Reference to secret in Supabase Vault or external secret manager
  credentials_ref  TEXT NULL,
  sync_status      TEXT NULL CHECK (sync_status IN ('idle', 'syncing', 'error')),
  last_sync_at     TIMESTAMPTZ NULL,
  last_error       TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, integration_type)
);

-- ── 5. SECURITY DEFINER helper ────────────────────────────────
-- Same pattern as is_project_member() (see migration 00002).
-- Called inside RLS policies in 00034; never called directly by app code.
CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   tenant_members
    WHERE  tenant_id = p_tenant_id
    AND    user_id   = auth.uid()
  )
$$;

-- ── 6. Bootstrap tenant + settings ───────────────────────────
-- One tenant for the current (sole) customer. Slug 'aksum' matches
-- the product name; the human can UPDATE name/slug later via SQL.
-- All settings columns default to '{}' — safe out of the box.
INSERT INTO tenants (name, slug)
VALUES ('Aksum', 'aksum');

INSERT INTO tenant_settings (tenant_id)
SELECT id FROM tenants WHERE slug = 'aksum';

-- ── 7. Bootstrap tenant_members ──────────────────────────────
-- Promote every existing user who owns at least one project to
-- tenant 'owner'; all others become 'member'. Idempotent.
INSERT INTO tenant_members (tenant_id, user_id, role)
SELECT DISTINCT
  t.id,
  pm.user_id,
  CASE WHEN pm.role = 'owner' THEN 'owner' ELSE 'member' END
FROM  project_members pm
CROSS JOIN tenants t
WHERE pm.user_id IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO NOTHING;
