-- Phase 2.5 — Drop global entities UNIQUE(name, type); add project-scoped unique index.
--
-- Background:
--   00001_initial_schema.sql created entities with UNIQUE(name, type) — a global
--   constraint. When 00009_entity_normalization.sql added project_id (nullable;
--   NULL = global), the constraint was not updated.  Two projects cannot own the
--   same entity name+type independently; matchOrCreateEntity silently recovers
--   from the resulting 23505 by returning the existing entity from the colliding
--   scope — a cross-project merge with no trace.
--
-- Pre-flight (Phase 0, 2026-05-05):
--   §12.10 — duplicate canonicals (same normalized_name + type): 0
--   §12.12 — project/global collisions on the same name:        0
--   → no remediation migration required; this migration ships directly.
--
-- Design mirrors entity_aliases scope from 00009:
--   COALESCE(project_id, '00000000-0000-0000-0000-000000000000') so that
--   global rows (NULL project_id) still deduplicate among themselves while
--   project rows are fully independent.
--
-- Forward-compat: index is named entities_name_type_scope_unique so Phase 3a
-- (workspaces) can target it by name when adding workspace_id scoping.

-- 1. Drop the original global constraint from 00001.
ALTER TABLE entities
  DROP CONSTRAINT IF EXISTS entities_name_type_key;

-- 2. Project-scoped unique index.
--    Global entities (project_id IS NULL) share a single virtual scope via the
--    COALESCE sentinel UUID; project entities each have their own scope.
CREATE UNIQUE INDEX IF NOT EXISTS entities_name_type_scope_unique
  ON entities (
    normalized_name,
    type,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
