-- ============================================================
-- Migration 00048: relationship_types array + represents type
-- ============================================================
-- 1. Add `represents` relation type (person → org/country spokesperson).
--    Was referenced in the canonical taxonomy spec but omitted from
--    migration 00045.
--
-- 2. Replace the single-value `interviewee_relationship_type` column
--    (added in 00047, no production data) with an array column
--    `interviewee_relationship_types relation_type[]`.
--    Reason: the upload form supports selecting multiple relationship
--    types for the same person→org anchor pair (e.g. is_ceo_of +
--    founded), each of which drives a separate anchor_derived
--    entity_relationships row.
--
-- 3. Add `participant_anchor_relationships` JSONB column to `sources`
--    to store participant-level relationship intents from the upload form.
--    Shape: [{person_entity_id, org_entity_id, relation_types}[]]
--    Written by the API route; consumed by the pipeline to create
--    anchor_derived entity_relationships rows.
--
-- All ADD VALUE / ADD COLUMN / DROP COLUMN are non-destructive.
-- ============================================================

-- 1. Add represents relation type
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'represents';

-- 2. Replace single-value column with array (column was added in 00047,
--    is always NULL, no existing data to migrate)
ALTER TABLE sources DROP COLUMN IF EXISTS interviewee_relationship_type;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS interviewee_relationship_types relation_type[];

-- 3. Participant relationship intents (JSONB, for flexibility without
--    additional FK tables at this stage)
ALTER TABLE sources ADD COLUMN IF NOT EXISTS participant_anchor_relationships JSONB;
