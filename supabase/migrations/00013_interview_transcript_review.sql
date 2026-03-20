-- ============================================
-- Phase 3.6: Human transcript review + reviewed reprocessing
-- ============================================

CREATE TYPE transcript_review_status AS ENUM ('none', 'draft', 'ready', 'reprocessing');

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS reviewed_utterances JSONB,
  ADD COLUMN IF NOT EXISTS transcript_review_status transcript_review_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_intel_source TEXT;

COMMENT ON COLUMN interviews.reviewed_utterances IS
  'Human-edited utterances [{ speaker, text, start, end }]; sole transcript source for reviewed reprocessing.';
COMMENT ON COLUMN interviews.transcript_review_status IS
  'Review workflow: none, draft, ready (eligible for reprocess), reprocessing (in progress).';
COMMENT ON COLUMN interviews.last_intel_source IS
  'Audit: e.g. assemblyai_auto vs human_review — which pass produced current chunks/summary.';

-- ── Structured seed entities (strong inputs to reviewed extraction) ─────────

CREATE TABLE interview_review_entities (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  entity_type entity_type NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interview_review_entities_interview
  ON interview_review_entities(interview_id);

CREATE TRIGGER update_interview_review_entities_updated_at
  BEFORE UPDATE ON interview_review_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE interview_review_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view interview review entities"
  ON interview_review_entities FOR SELECT
  USING (is_project_member(get_interview_project(interview_id)));

CREATE POLICY "Editors can insert interview review entities"
  ON interview_review_entities FOR INSERT
  WITH CHECK (is_project_editor(get_interview_project(interview_id)));

CREATE POLICY "Editors can update interview review entities"
  ON interview_review_entities FOR UPDATE
  USING (is_project_editor(get_interview_project(interview_id)));

CREATE POLICY "Editors can delete interview review entities"
  ON interview_review_entities FOR DELETE
  USING (is_project_editor(get_interview_project(interview_id)));

-- ── Single-call wipe of derived rows (service role / admin client only) ───
-- Used immediately before re-inserting chunks/mentions/relationships/snippets
-- for reviewed reprocessing. Does NOT wrap LLM work; pair with application-side
-- compute-first ordering. See docs/architecture/ingestion-pipeline.md.

CREATE OR REPLACE FUNCTION public.clear_interview_derived_data(p_interview_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM entity_relationships WHERE interview_id = p_interview_id;
  DELETE FROM entity_mentions WHERE interview_id = p_interview_id;
  DELETE FROM interview_chunks WHERE interview_id = p_interview_id;
  DELETE FROM content_snippets WHERE interview_id = p_interview_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_interview_derived_data(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_interview_derived_data(UUID) TO service_role;
