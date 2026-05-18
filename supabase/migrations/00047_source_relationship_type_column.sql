-- ============================================================
-- Migration 00047: add interviewee_relationship_type to sources
-- ============================================================
-- Stores the uploader-selected relationship type for the primary
-- person↔org anchor. Used by the pipeline to create a deterministic
-- entity_relationships row with the correct type instead of always
-- defaulting to affiliated_with.
--
-- Nullable: if not set, the pipeline falls back to title-based
-- inference (inferRelationTypeFromTitle) or 'works_at'.
--
-- Part of Phase 2 of entity-relationship-extraction spec.
-- ============================================================

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS interviewee_relationship_type relation_type;
