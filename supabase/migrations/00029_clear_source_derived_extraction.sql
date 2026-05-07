-- ============================================================================
-- 00029 — clear_source_derived_data: also wipe origin='extraction' source_entities
-- (Phase 2.3 / PR 2.3)
-- ============================================================================
-- The reviewed-reprocess path calls clear_source_derived_data(p_source_id)
-- before re-extracting from the human-edited transcript. PR 2.3 adds a new
-- write target (source_entities). On reprocess, LLM-derived associations
-- (origin='extraction') must be wiped so the new pass starts from a clean
-- slate; deterministic / external-system rows
-- (origin='upload_anchor', 'manual_tag', 'crm_import', 'human_review',
-- 'metadata_import', 'ai_inference', 'alias_propagation', 'prior_context')
-- MUST be preserved — they reflect facts external to the LLM pass.
--
-- This migration only rewrites the function body; the signature and the
-- existing DELETE behaviour for entity_relationships / entity_mentions /
-- source_chunks / content_snippets are unchanged. Backwards-compatible:
-- the new DELETE is a no-op on databases without any extraction rows yet.
--
-- Plan-numbering note: the database-refactor-plan reserved 00029 for PR 2.5
-- (entities.UNIQUE(name, type) drop). PR 2.3 claims 00029 because this
-- helper change is tightly coupled with PR 2.3's new writes. PR 2.5's
-- migration becomes 00030. No schema or app coupling.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clear_source_derived_data(p_source_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Preserve human-decided relationship rows (matches 00023 behaviour).
  DELETE FROM public.entity_relationships
   WHERE interview_id = p_source_id
     AND review_status = 'pending'
     AND origin = 'llm';

  DELETE FROM public.entity_mentions   WHERE interview_id = p_source_id;
  DELETE FROM public.source_chunks     WHERE source_id    = p_source_id;
  DELETE FROM public.content_snippets  WHERE interview_id = p_source_id;

  -- New (PR 2.3): wipe LLM-derived source-level associations only.
  -- upload_anchor / manual_tag / crm_import / human_review /
  -- metadata_import / ai_inference / alias_propagation / prior_context
  -- represent facts external to the LLM pass and are preserved.
  DELETE FROM public.source_entities
   WHERE source_id = p_source_id
     AND origin = 'extraction';
END;
$$;

REVOKE ALL  ON FUNCTION public.clear_source_derived_data(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_source_derived_data(UUID) TO service_role;

COMMENT ON FUNCTION public.clear_source_derived_data(UUID) IS
  'Wipes derived rows for a source: chunks, mentions, llm-pending relationships, snippets, and origin=extraction source_entities. Preserves human-edited / approved / rejected relationships AND non-extraction source_entities (upload_anchor, manual_tag, crm_import, human_review, metadata_import, ai_inference, alias_propagation, prior_context). Phase 2.3 extension of 00027 / 00023.';
