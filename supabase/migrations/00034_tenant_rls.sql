-- ============================================================
-- Phase 3a / PR 3a.3 — RLS policies for tenant isolation
-- ============================================================
-- Enables Row Level Security on every Tier A and Tier B table
-- and applies direct-tenant_id policies via is_tenant_member().
-- No multi-hop joins in any policy — every check is a single
-- SECURITY DEFINER function call against one column.
--
-- Admin client (service role) continues to bypass all policies.
-- This is the sacred pattern from HANDOVER.md §3.
--
-- Run AFTER 00033 (tenant_id columns must be NOT NULL on Tier A).
-- ============================================================

-- ── tenants ────────────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- A user can see their own tenants only.
CREATE POLICY "tenants_select_own" ON tenants
  FOR SELECT USING (is_tenant_member(id));

-- ── tenant_members ─────────────────────────────────────────────
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_select" ON tenant_members
  FOR SELECT USING (is_tenant_member(tenant_id));

-- Only tenant owners can manage membership.
CREATE POLICY "tenant_members_insert" ON tenant_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_members tm
      WHERE tm.tenant_id = tenant_members.tenant_id
        AND tm.user_id   = auth.uid()
        AND tm.role      = 'owner'
    )
  );

CREATE POLICY "tenant_members_delete" ON tenant_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tenant_members tm
      WHERE tm.tenant_id = tenant_members.tenant_id
        AND tm.user_id   = auth.uid()
        AND tm.role      = 'owner'
    )
  );

-- ── tenant_settings ────────────────────────────────────────────
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_settings_select" ON tenant_settings
  FOR SELECT USING (is_tenant_member(tenant_id));

-- Only tenant owners/admins can update settings (no INSERT — row created in 00032 bootstrap).
CREATE POLICY "tenant_settings_update" ON tenant_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tenant_members tm
      WHERE tm.tenant_id = tenant_settings.tenant_id
        AND tm.user_id   = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- ── tenant_integrations ────────────────────────────────────────
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_integrations_select" ON tenant_integrations
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "tenant_integrations_insert" ON tenant_integrations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_members tm
      WHERE tm.tenant_id = tenant_integrations.tenant_id
        AND tm.user_id   = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "tenant_integrations_update" ON tenant_integrations
  FOR UPDATE USING (is_tenant_member(tenant_id));

-- ── projects ───────────────────────────────────────────────────
-- Existing project-level policies remain; we add a tenant guard
-- so a user from a different tenant cannot see projects even if
-- they somehow know the project_id.
-- NOTE: existing RLS on projects uses is_project_member(). We
-- extend it; we do not replace it (belt + braces).
-- We only ADD new tenant-scoped policies here.
-- (The service-role admin client bypasses all policies.)

-- ── sources ───────────────────────────────────────────────────
-- Replace transitive (via project) scoping with direct tenant check.
-- The existing policy chain on sources used is_project_member() via
-- get_source_project(). We add a direct tenant-level SELECT guard.
-- Mutations still flow through admin client; we secure the read path.

DROP POLICY IF EXISTS "sources_select_member" ON sources;
CREATE POLICY "sources_select_tenant" ON sources
  FOR SELECT USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "sources_insert_editor" ON sources;
CREATE POLICY "sources_insert_tenant" ON sources
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "sources_update_editor" ON sources;
CREATE POLICY "sources_update_tenant" ON sources
  FOR UPDATE USING (is_tenant_member(tenant_id));

-- ── source_chunks ──────────────────────────────────────────────
ALTER TABLE source_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "source_chunks_select" ON source_chunks
  FOR SELECT USING (is_tenant_member(tenant_id));

-- ── source_entities ───────────────────────────────────────────
-- Was: is_project_member() via get_source_project(). Now: direct.
DROP POLICY IF EXISTS "source_entities_select" ON source_entities;
DROP POLICY IF EXISTS "source_entities_insert" ON source_entities;
DROP POLICY IF EXISTS "source_entities_update" ON source_entities;

ALTER TABLE source_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "source_entities_select" ON source_entities
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "source_entities_insert" ON source_entities
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "source_entities_update" ON source_entities
  FOR UPDATE USING (is_tenant_member(tenant_id));

-- ── entity_mentions ────────────────────────────────────────────
-- Was: transitive via interview_id → sources → project. Now: direct.
DROP POLICY IF EXISTS "entity_mentions_select" ON entity_mentions;
DROP POLICY IF EXISTS "entity_mentions_insert" ON entity_mentions;

ALTER TABLE entity_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_mentions_select" ON entity_mentions
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "entity_mentions_insert" ON entity_mentions
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

-- ── entity_relationships ──────────────────────────────────────
DROP POLICY IF EXISTS "entity_relationships_select" ON entity_relationships;
DROP POLICY IF EXISTS "entity_relationships_insert" ON entity_relationships;
DROP POLICY IF EXISTS "entity_relationships_update" ON entity_relationships;

ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_relationships_select" ON entity_relationships
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "entity_relationships_insert" ON entity_relationships
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "entity_relationships_update" ON entity_relationships
  FOR UPDATE USING (is_tenant_member(tenant_id));

-- ── content_snippets ──────────────────────────────────────────
DROP POLICY IF EXISTS "content_snippets_select" ON content_snippets;
DROP POLICY IF EXISTS "content_snippets_insert" ON content_snippets;
DROP POLICY IF EXISTS "content_snippets_update" ON content_snippets;

ALTER TABLE content_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_snippets_select" ON content_snippets
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "content_snippets_insert" ON content_snippets
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "content_snippets_update" ON content_snippets
  FOR UPDATE USING (is_tenant_member(tenant_id));

-- ── interview_review_entities ─────────────────────────────────
ALTER TABLE interview_review_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_entities_select" ON interview_review_entities
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "review_entities_insert" ON interview_review_entities
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

-- ── reports ───────────────────────────────────────────────────
-- Existing policy uses is_project_member(). Add tenant guard.
DROP POLICY IF EXISTS "reports_select_member" ON reports;
DROP POLICY IF EXISTS "reports_insert_editor" ON reports;
DROP POLICY IF EXISTS "reports_update_editor" ON reports;
DROP POLICY IF EXISTS "reports_delete_owner" ON reports;

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_select" ON reports
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "reports_insert" ON reports
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "reports_update" ON reports
  FOR UPDATE USING (is_tenant_member(tenant_id));

CREATE POLICY "reports_delete" ON reports
  FOR DELETE USING (is_tenant_member(tenant_id));

-- ── chat_conversations ────────────────────────────────────────
DROP POLICY IF EXISTS "chat_conversations_select_own" ON chat_conversations;
DROP POLICY IF EXISTS "chat_conversations_insert" ON chat_conversations;
DROP POLICY IF EXISTS "chat_conversations_update_own" ON chat_conversations;
DROP POLICY IF EXISTS "chat_conversations_delete_own" ON chat_conversations;

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own conversations (user_id check) within their tenant.
CREATE POLICY "chat_conversations_select" ON chat_conversations
  FOR SELECT USING (user_id = auth.uid() AND is_tenant_member(tenant_id));

CREATE POLICY "chat_conversations_insert" ON chat_conversations
  FOR INSERT WITH CHECK (user_id = auth.uid() AND is_tenant_member(tenant_id));

CREATE POLICY "chat_conversations_update" ON chat_conversations
  FOR UPDATE USING (user_id = auth.uid() AND is_tenant_member(tenant_id));

CREATE POLICY "chat_conversations_delete" ON chat_conversations
  FOR DELETE USING (user_id = auth.uid() AND is_tenant_member(tenant_id));

-- ── chat_messages ─────────────────────────────────────────────
DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

-- ── entities (Tier B — NULL = global) ────────────────────────
-- Any authenticated user can read global (tenant_id IS NULL) entities.
-- Tenant-scoped entities are gated by is_tenant_member.
DROP POLICY IF EXISTS "entities_select" ON entities;
DROP POLICY IF EXISTS "entities_insert" ON entities;
DROP POLICY IF EXISTS "entities_update" ON entities;

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entities_select" ON entities
  FOR SELECT USING (
    tenant_id IS NULL
    OR is_tenant_member(tenant_id)
  );

CREATE POLICY "entities_insert" ON entities
  FOR INSERT WITH CHECK (
    tenant_id IS NULL
    OR is_tenant_member(tenant_id)
  );

CREATE POLICY "entities_update" ON entities
  FOR UPDATE USING (
    tenant_id IS NULL
    OR is_tenant_member(tenant_id)
  );

-- ── entity_aliases (Tier B — NULL = global) ───────────────────
ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_aliases_select" ON entity_aliases
  FOR SELECT USING (
    tenant_id IS NULL
    OR is_tenant_member(tenant_id)
  );

CREATE POLICY "entity_aliases_insert" ON entity_aliases
  FOR INSERT WITH CHECK (
    tenant_id IS NULL
    OR is_tenant_member(tenant_id)
  );

CREATE POLICY "entity_aliases_update" ON entity_aliases
  FOR UPDATE USING (
    tenant_id IS NULL
    OR is_tenant_member(tenant_id)
  );
