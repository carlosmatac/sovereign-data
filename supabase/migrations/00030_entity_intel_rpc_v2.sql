-- ============================================
-- Phase 2.4 / PR 2.4 — entity_intel RPC v2: read source_entities
-- ============================================
--
-- Rewrites the entity_intel SECURITY DEFINER function (00026) so that
-- branches 2 and 3 (legacy interviewee_*_entity_id FK columns on sources)
-- are replaced by a single, richer branch reading source_entities.
--
-- Why this matters:
--   After Phase 2.2 (backfill) and Phase 2.3 (pipeline writes), every
--   source-level entity association lives in source_entities with full
--   provenance (link_type, origin, is_primary, confidence). Reading from
--   source_entities:
--     * Covers interviewee + interviewee_org (the old FK branch data)
--     * Also surfaces extraction-confidence rows (author, primary_subject,
--       subject_organization) written by Phase 2.3 when LLM confidence >= 0.9
--     * Is structurally correct — the table designed for this purpose
--
-- The function signature and return shape are UNCHANGED — the chat tool
-- (lookupMentions) calls this RPC and expects the same columns.
--
-- Unchanged branches:
--   1. entity_mentions (chunk-level mentions, today's behaviour)
--   4. entity_relationships (non-rejected edges)
--
-- The back-compat `interviews` view and sources.interviewee_*_entity_id
-- columns are NOT removed by this migration (per plan backwards-compat
-- strategy — deprecated for one full release window).
--
-- Spec:  docs/features/on-going/entity-intel-rpc-source-entities.md
-- Plan:  docs/roadmaps/database-refactor-plan.md §4 PR 2.4

CREATE OR REPLACE FUNCTION public.entity_intel(
  p_entity_id  UUID,
  p_project_id UUID DEFAULT NULL
)
RETURNS TABLE (
  source_id    UUID,
  source_title TEXT,
  role         TEXT,
  kind         TEXT,
  evidence     TEXT,
  chunk_id     UUID,
  sentiment    TEXT,
  conducted_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- 1) Mentions (chunk-level, today's behaviour). LEFT JOIN to source_chunks so
  -- pre-gate rows with chunk_id IS NULL still surface (audit §12.4).
  SELECT s.id              AS source_id,
         s.title            AS source_title,
         'mention'::text    AS role,
         'mention'::text    AS kind,
         c.content          AS evidence,
         em.chunk_id        AS chunk_id,
         em.sentiment       AS sentiment,
         s.conducted_at     AS conducted_at,
         s.created_at       AS created_at
  FROM entity_mentions em
  JOIN sources s              ON s.id = em.interview_id
  LEFT JOIN source_chunks c   ON c.id = em.chunk_id
  WHERE em.entity_id = p_entity_id
    AND (p_project_id IS NULL OR s.project_id = p_project_id)

  UNION ALL

  -- 2) Source-level associations via source_entities (Phase 2.4).
  --    Replaces the legacy interviewee_*_entity_id FK branches from 00026.
  --    Covers:
  --      * upload_anchor rows  — interviewee, interviewee_org (backfilled in
  --        Phase 2.2; written at upload time in Phase 2.3)
  --      * extraction rows     — author, primary_subject, subject_organization
  --        (written by Phase 2.3 when LLM source_associations confidence >= 0.9)
  --    kind: deterministic origins (upload_anchor / metadata_import / manual_tag /
  --          human_review) → 'anchor'; inferred origins → 'source_entity'.
  SELECT se.source_id,
         s.title AS source_title,
         se.link_type::text AS role,
         CASE se.origin
           WHEN 'upload_anchor'   THEN 'anchor'
           WHEN 'metadata_import' THEN 'anchor'
           WHEN 'manual_tag'      THEN 'anchor'
           WHEN 'human_review'    THEN 'anchor'
           ELSE 'source_entity'
         END AS kind,
         (se.evidence->>'text')::text AS evidence,
         NULL::uuid AS chunk_id,
         NULL::text AS sentiment,
         s.conducted_at,
         s.created_at
  FROM source_entities se
  JOIN sources s ON s.id = se.source_id
  WHERE se.entity_id = p_entity_id
    AND (p_project_id IS NULL OR s.project_id = p_project_id)

  UNION ALL

  -- 3) Active (non-rejected) relationship rows touching this entity.
  SELECT s.id, s.title, 'related_via_relationship'::text, 'relationship'::text,
         er.evidence_text, NULL::uuid, NULL::text,
         s.conducted_at, s.created_at
  FROM entity_relationships er
  JOIN sources s ON s.id = er.interview_id
  WHERE (er.source_entity_id = p_entity_id OR er.target_entity_id = p_entity_id)
    AND er.review_status <> 'rejected'
    AND (p_project_id IS NULL OR s.project_id = p_project_id);
$$;

COMMENT ON FUNCTION public.entity_intel(UUID, UUID) IS
  'Phase 2.4 RPC for chat entity-centered retrieval. Returns sources where the entity appears as a chunk-level mention, a source_entities association (interviewee, author, primary_subject, ...), or a non-rejected relationship. Branch 2 now reads source_entities directly (replaces legacy interviewee_*_entity_id FK columns from Phase 1). See docs/features/on-going/entity-intel-rpc-source-entities.md.';

REVOKE ALL ON FUNCTION public.entity_intel(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity_intel(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.entity_intel(UUID, UUID) TO authenticated;
