-- ============================================================
-- Migration 00023: editorial state on entity_relationships
-- ============================================================
-- Adds the minimum editorial metadata required to let editors
-- correct LLM-extracted relationships in the interview-detail
-- context, and ensures human decisions survive reprocess.
--
-- See docs/features/on-going/editable-relationship-governance.md
-- ============================================================

-- ── Enums ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationship_review_status') THEN
    CREATE TYPE relationship_review_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationship_origin') THEN
    CREATE TYPE relationship_origin AS ENUM ('llm', 'human_created', 'human_edited');
  END IF;
END$$;

-- ── Editorial columns ─────────────────────────────────────────────────────
ALTER TABLE entity_relationships
  ADD COLUMN IF NOT EXISTS review_status relationship_review_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS origin        relationship_origin        NOT NULL DEFAULT 'llm',
  ADD COLUMN IF NOT EXISTS reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_entity_rel_review_status
  ON entity_relationships(review_status);

-- ── updated_at trigger (uses helper from 00001) ───────────────────────────
DROP TRIGGER IF EXISTS update_entity_relationships_updated_at ON entity_relationships;
CREATE TRIGGER update_entity_relationships_updated_at
  BEFORE UPDATE ON entity_relationships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Reprocess wipe: preserve human-decided rows ───────────────────────────
-- Any row that has been touched editorially (status != 'pending' OR origin != 'llm')
-- survives the clear. Mentions / chunks / snippets are still wiped fully — they are
-- regenerable with no editorial state of their own.
CREATE OR REPLACE FUNCTION public.clear_interview_derived_data(p_interview_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM entity_relationships
   WHERE interview_id = p_interview_id
     AND review_status = 'pending'
     AND origin = 'llm';

  DELETE FROM entity_mentions   WHERE interview_id = p_interview_id;
  DELETE FROM interview_chunks  WHERE interview_id = p_interview_id;
  DELETE FROM content_snippets  WHERE interview_id = p_interview_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_interview_derived_data(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_interview_derived_data(UUID) TO service_role;
