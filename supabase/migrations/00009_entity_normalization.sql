-- ============================================
-- Phase 3.6: Entity Normalization Foundation
-- ============================================
-- Adds canonical entity support, alias mapping, and
-- hybrid scoping (global vs project-scoped entities).
-- ============================================

-- Ensure trigram extension exists for fuzzy matching indexes
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";

-- ============================================
-- 1) Extend entities table
-- ============================================
ALTER TABLE entities
  ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ADD COLUMN canonical_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  ADD COLUMN normalized_name TEXT NOT NULL DEFAULT '';

-- Backfill normalized_name for existing rows
UPDATE entities
SET normalized_name = lower(trim(name))
WHERE normalized_name = '';

CREATE INDEX idx_entities_project_id ON entities(project_id);
CREATE INDEX idx_entities_normalized_name ON entities(normalized_name);
CREATE INDEX idx_entities_canonical_entity_id ON entities(canonical_entity_id);

-- Trigram index for fuzzy canonical lookup
CREATE INDEX idx_entities_normalized_name_trgm
  ON entities
  USING gin(normalized_name gin_trgm_ops);

-- ============================================
-- 2) Create entity_aliases table
-- ============================================
CREATE TABLE entity_aliases (
  id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entity_id        UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  alias            TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  source           TEXT,
  confidence       REAL NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce uniqueness with project fallback semantics:
-- NULL project_id (global) is treated as one shared scope.
CREATE UNIQUE INDEX idx_entity_aliases_entity_alias_scope_unique
  ON entity_aliases(entity_id, alias_normalized, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX idx_entity_aliases_alias_normalized
  ON entity_aliases(alias_normalized);

CREATE INDEX idx_entity_aliases_project_id
  ON entity_aliases(project_id);

-- Trigram index for fuzzy alias lookup
CREATE INDEX idx_entity_aliases_alias_normalized_trgm
  ON entity_aliases
  USING gin(alias_normalized gin_trgm_ops);

-- Keep updated_at consistent with existing schema conventions
CREATE TRIGGER update_entity_aliases_updated_at
  BEFORE UPDATE ON entity_aliases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
