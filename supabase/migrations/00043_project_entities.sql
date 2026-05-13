-- ============================================================================
-- Migration 00043: project_entities — direct many-to-many project ↔ entity link
-- ============================================================================
-- Spec: docs/features/on-going/project-entity-linking.md
--
-- Creates an explicit join table so entities can be associated with a project
-- independently of whether they appear in any source within that project.
--
-- Design notes:
--   • Single-column FK for entity_id only — entities.tenant_id is nullable
--     (global entities have tenant_id IS NULL), so a compound FK on
--     (entity_id, tenant_id) would fail for global entities.
--   • Compound FK (project_id, tenant_id) → projects(id, tenant_id) follows
--     the Phase 3a consistency pattern (migration 00033).
--   • created_by is nullable — system-created rows or future bulk imports
--     may not have a user author.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.project_entities (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id   UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  note        TEXT,
  created_by  UUID        REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, entity_id)
);

-- ── Compound FK for tenant consistency ──────────────────────────────────────
ALTER TABLE public.project_entities
  ADD CONSTRAINT project_entities_project_tenant_fkey
  FOREIGN KEY (project_id, tenant_id)
  REFERENCES public.projects(id, tenant_id)
  ON DELETE CASCADE;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_project_entities_project_id  ON public.project_entities (project_id);
CREATE INDEX idx_project_entities_entity_id   ON public.project_entities (entity_id);
CREATE INDEX idx_project_entities_tenant_id   ON public.project_entities (tenant_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.project_entities ENABLE ROW LEVEL SECURITY;

-- Members can read direct links for any project they belong to.
CREATE POLICY "Members can view project entity links"
  ON public.project_entities FOR SELECT
  USING (is_project_member(project_id));

-- Editors (owner or editor role) can create direct links.
CREATE POLICY "Editors can insert project entity links"
  ON public.project_entities FOR INSERT
  WITH CHECK (is_project_editor(project_id));

-- Editors can remove direct links.
CREATE POLICY "Editors can delete project entity links"
  ON public.project_entities FOR DELETE
  USING (is_project_editor(project_id));

-- Editors can update the note on an existing link.
CREATE POLICY "Editors can update project entity links"
  ON public.project_entities FOR UPDATE
  USING (is_project_editor(project_id));

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_entities TO authenticated, service_role;

COMMENT ON TABLE public.project_entities IS
  'Direct many-to-many link between projects and entities. Distinct from the '
  'pipeline-produced source → source_entities path; this is an explicit, '
  'user-managed association. Migration 00043.';
