-- ============================================
-- Phase 1 / PR 1.1 — entity_intel SECURITY DEFINER RPC
-- ============================================
--
-- Unified entity-centered retrieval used by the Copilot's lookupMentions
-- tool. UNION of:
--   1. entity_mentions (today's behaviour, with chunk content + sentiment)
--   2. interviews where interviewee_entity_id     = p_entity_id  (role='interviewee')
--   3. interviews where interviewee_org_entity_id = p_entity_id  (role='interviewee_org')
--   4. entity_relationships where source/target   = p_entity_id  AND
--      review_status <> 'rejected'                              (role='related_via_relationship')
--
-- The "interviewee" branches close the symptom documented in
-- docs/audits/database-retrieval-architecture-audit.md §13: an entity
-- that is the interviewee of an interview can have zero entity_mentions
-- rows for that interview because the April 2026 persistence gate
-- intentionally drops anchor-only matches. Without this branch the chat
-- tool returns []. With it the chat tool returns the interview with
-- role='interviewee'.
--
-- The "related_via_relationship" branch mirrors getRelationships() in
-- src/lib/ai/entity-lookup.ts (and the editorial rule documented in
-- src/__tests__/relationship-active-filter.test.ts):
-- review_status='rejected' rows are kept in the DB for governance UI
-- and reprocess suppression but MUST NOT surface in active chat
-- retrieval.
--
-- Spec: docs/features/on-going/chat-entity-retrieval-rpc.md
-- Plan: docs/roadmaps/database-refactor-plan.md §3
--
-- Forward-compat with Phase 2.1: this function references `interviews`
-- and `interview_chunks` by their pre-rename names. After Phase 2.1
-- (in-place rename to `sources` / `source_chunks`) those become read-
-- only back-compat views, so the function continues to work unchanged
-- until PR 2.4 rewrites it to read `source_entities` directly.

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
  -- 1) Mentions (today's behaviour). LEFT JOIN to interview_chunks so
  -- pre-gate rows with chunk_id IS NULL still surface (audit §12.4).
  SELECT i.id              AS source_id,
         i.title            AS source_title,
         'mention'::text    AS role,
         'mention'::text    AS kind,
         c.content          AS evidence,
         em.chunk_id        AS chunk_id,
         em.sentiment       AS sentiment,
         i.conducted_at     AS conducted_at,
         i.created_at       AS created_at
  FROM entity_mentions em
  JOIN interviews i           ON i.id = em.interview_id
  LEFT JOIN interview_chunks c ON c.id = em.chunk_id
  WHERE em.entity_id = p_entity_id
    AND (p_project_id IS NULL OR i.project_id = p_project_id)

  UNION ALL

  -- 2) Interviewee anchor (the entity IS the interviewee — the chunk-
  -- level mention may have been dropped by the persistence gate).
  SELECT i.id, i.title, 'interviewee'::text, 'anchor'::text,
         NULL::text, NULL::uuid, NULL::text,
         i.conducted_at, i.created_at
  FROM interviews i
  WHERE i.interviewee_entity_id = p_entity_id
    AND (p_project_id IS NULL OR i.project_id = p_project_id)

  UNION ALL

  -- 3) Interviewee-org anchor (same rationale as #2 for orgs).
  SELECT i.id, i.title, 'interviewee_org'::text, 'anchor'::text,
         NULL::text, NULL::uuid, NULL::text,
         i.conducted_at, i.created_at
  FROM interviews i
  WHERE i.interviewee_org_entity_id = p_entity_id
    AND (p_project_id IS NULL OR i.project_id = p_project_id)

  UNION ALL

  -- 4) Active (non-rejected) relationship rows touching this entity.
  SELECT i.id, i.title, 'related_via_relationship'::text, 'relationship'::text,
         er.evidence_text, NULL::uuid, NULL::text,
         i.conducted_at, i.created_at
  FROM entity_relationships er
  JOIN interviews i ON i.id = er.interview_id
  WHERE (er.source_entity_id = p_entity_id OR er.target_entity_id = p_entity_id)
    AND er.review_status <> 'rejected'
    AND (p_project_id IS NULL OR i.project_id = p_project_id);
$$;

COMMENT ON FUNCTION public.entity_intel(UUID, UUID) IS
  'Phase 1 RPC for chat entity-centered retrieval. Returns interviews where the entity appears as a textual mention, an upload-anchor interviewee/interviewee_org, or via a non-rejected relationship. Replaces lookupMentions backing query. See docs/features/on-going/chat-entity-retrieval-rpc.md.';

REVOKE ALL ON FUNCTION public.entity_intel(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity_intel(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.entity_intel(UUID, UUID) TO authenticated;
