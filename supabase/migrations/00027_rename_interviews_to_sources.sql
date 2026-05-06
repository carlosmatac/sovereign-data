-- ============================================================================
-- Migration 00027: rename interviews → sources, interview_chunks → source_chunks
-- ============================================================================
-- Phase 2.1 / PR 2.1 of docs/roadmaps/database-refactor-plan.md
-- Spec: docs/features/to-do/source-rename-and-backcompat-views.md
--
-- This migration (steps run in order — ordering matters for FK / RLS deps):
--   1. Renames the canonical tables to source-first names.
--   2. Renames the column `interview_chunks.interview_id` → `source_chunks.source_id`.
--   3. Renames primary-key + secondary indexes to match.
--   4. Renames the `update_interviews_updated_at` trigger.
--   5. Creates `get_source_project(...)` and `clear_source_derived_data(...)`
--      (new SECURITY DEFINER helpers reading from `sources` / `source_chunks`).
--      The OLD function names stay in place for now.
--   6. Re-creates the 8 RLS policies that depended on the OLD helper, now
--      pointed at `get_source_project`. Policy names that said "interviews"
--      / "chunks" are renamed for hygiene.
--   7. Re-creates `hybrid_search` (both overloads) reading from `source_chunks`
--      and `source_id` internally. Return shape kept (`interview_id` column
--      preserved) so chat code does not need a touch in this PR.
--   8. Creates read-only back-compat views `public.interviews` and
--      `public.interview_chunks` so existing read-side callers keep working
--      for one release window. Postgres views are read-only by default;
--      every write call site in the app code is being migrated to the new
--      table names in the same PR.
--   9. Drops the OLD function names (`get_interview_project`,
--      `clear_interview_derived_data`). Safe at this point because step 6
--      repointed every dependent RLS policy at the new helper. Dropping
--      these earlier fails with SQLSTATE 2BP01 (dependent object).
--
-- `entity_intel` (migration 00026) is left untouched: its body joins
-- `interviews` / `interview_chunks` and resolves through the back-compat
-- views post-rename. PR 2.4 will rewrite it to read `source_entities`.
--
-- The `interview_id` column on `entity_mentions`, `entity_relationships`,
-- `content_snippets`, `interview_review_entities`, and `chat_conversations`
-- is INTENTIONALLY kept named `interview_id` this release — renaming those
-- columns is a separate, larger ripple deferred to PR 2.4 per the spec.
--
-- The migration is written to be idempotent so `scripts/db/migration-dry-run.ts`
-- can apply it inside a `BEGIN; ... ROLLBACK;` block safely.
-- ============================================================================

-- ── 1. Tables and column rename (guarded for idempotency) ───────────────────
ALTER TABLE IF EXISTS public.interviews       RENAME TO sources;
ALTER TABLE IF EXISTS public.interview_chunks RENAME TO source_chunks;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'source_chunks'
      AND column_name = 'interview_id'
  ) THEN
    ALTER TABLE public.source_chunks RENAME COLUMN interview_id TO source_id;
  END IF;
END$$;

-- ── 2. Primary key indexes (Postgres does NOT auto-rename) ──────────────────
ALTER INDEX IF EXISTS public.interviews_pkey       RENAME TO sources_pkey;
ALTER INDEX IF EXISTS public.interview_chunks_pkey RENAME TO source_chunks_pkey;

-- ── 3. Secondary indexes ────────────────────────────────────────────────────
ALTER INDEX IF EXISTS public.idx_interviews_status                    RENAME TO idx_sources_status;
ALTER INDEX IF EXISTS public.idx_interviews_project                   RENAME TO idx_sources_project;
ALTER INDEX IF EXISTS public.idx_interviews_interviewee_entity_id     RENAME TO idx_sources_interviewee_entity_id;
ALTER INDEX IF EXISTS public.idx_interviews_interviewee_org_entity_id RENAME TO idx_sources_interviewee_org_entity_id;
ALTER INDEX IF EXISTS public.idx_chunks_embedding                     RENAME TO idx_source_chunks_embedding;
ALTER INDEX IF EXISTS public.idx_chunks_interview                     RENAME TO idx_source_chunks_source;
ALTER INDEX IF EXISTS public.idx_chunks_metadata                      RENAME TO idx_source_chunks_metadata;

-- ── 4. Trigger rename ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table  = 'sources'
      AND trigger_name        = 'update_interviews_updated_at'
  ) THEN
    ALTER TRIGGER update_interviews_updated_at ON public.sources
      RENAME TO update_sources_updated_at;
  END IF;
END$$;

-- ── 5. SECURITY DEFINER helpers (create the NEW names first) ────────────────
-- The old names (`get_interview_project`, `clear_interview_derived_data`) are
-- dropped at the end of this migration (step 8), AFTER the RLS policies that
-- depend on the old function have been re-pointed to the new name in step 6.
-- Dropping the old function before that fails with `2BP01` because
-- pg_depend lists 8 RLS policies as dependents.

-- 5a. get_source_project (replaces get_interview_project)
CREATE OR REPLACE FUNCTION public.get_source_project(p_source_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT project_id FROM public.sources WHERE id = p_source_id;
$$;

REVOKE ALL ON FUNCTION public.get_source_project(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_source_project(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_source_project(UUID) IS
  'Returns sources.project_id for a given source id. SECURITY DEFINER to bypass RLS in policy USING/CHECK clauses. Replaces get_interview_project (00002).';

-- 5b. clear_source_derived_data (replaces clear_interview_derived_data)
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
END;
$$;

REVOKE ALL ON FUNCTION public.clear_source_derived_data(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_source_derived_data(UUID) TO service_role;

COMMENT ON FUNCTION public.clear_source_derived_data(UUID) IS
  'Wipes derived rows (chunks, mentions, snippets, llm-pending relationships) for a source. Preserves human-edited / approved / rejected relationships. Replaces clear_interview_derived_data (00013/00023).';

-- ── 6. Re-create RLS policies on the NEW helper (drop old + new names; create) ───
-- 6a. sources (formerly interviews)
DROP POLICY IF EXISTS "Members can view interviews"   ON public.sources;
DROP POLICY IF EXISTS "Editors can create interviews" ON public.sources;
DROP POLICY IF EXISTS "Editors can update interviews" ON public.sources;
DROP POLICY IF EXISTS "Members can view sources"      ON public.sources;
DROP POLICY IF EXISTS "Editors can create sources"    ON public.sources;
DROP POLICY IF EXISTS "Editors can update sources"    ON public.sources;

CREATE POLICY "Members can view sources"
  ON public.sources FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Editors can create sources"
  ON public.sources FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND is_project_editor(project_id));

CREATE POLICY "Editors can update sources"
  ON public.sources FOR UPDATE
  USING (is_project_editor(project_id));

-- 6b. source_chunks (formerly interview_chunks); column is now source_id.
DROP POLICY IF EXISTS "Members can view chunks"        ON public.source_chunks;
DROP POLICY IF EXISTS "Members can view source chunks" ON public.source_chunks;

CREATE POLICY "Members can view source chunks"
  ON public.source_chunks FOR SELECT
  USING (is_project_member(get_source_project(source_id)));

-- 6c. entity_mentions: column stays interview_id this release.
DROP POLICY IF EXISTS "Members can view entity mentions" ON public.entity_mentions;

CREATE POLICY "Members can view entity mentions"
  ON public.entity_mentions FOR SELECT
  USING (is_project_member(get_source_project(interview_id)));

-- 6d. entity_relationships: column stays interview_id.
DROP POLICY IF EXISTS "Members can view entity relationships" ON public.entity_relationships;

CREATE POLICY "Members can view entity relationships"
  ON public.entity_relationships FOR SELECT
  USING (is_project_member(get_source_project(interview_id)));

-- 6e. content_snippets: column stays interview_id.
DROP POLICY IF EXISTS "Members can view content snippets" ON public.content_snippets;

CREATE POLICY "Members can view content snippets"
  ON public.content_snippets FOR SELECT
  USING (is_project_member(get_source_project(interview_id)));

-- 6f. interview_review_entities: table NAME stays; column stays interview_id.
DROP POLICY IF EXISTS "Members can view interview review entities"   ON public.interview_review_entities;
DROP POLICY IF EXISTS "Editors can insert interview review entities" ON public.interview_review_entities;
DROP POLICY IF EXISTS "Editors can update interview review entities" ON public.interview_review_entities;
DROP POLICY IF EXISTS "Editors can delete interview review entities" ON public.interview_review_entities;

CREATE POLICY "Members can view interview review entities"
  ON public.interview_review_entities FOR SELECT
  USING (is_project_member(get_source_project(interview_id)));

CREATE POLICY "Editors can insert interview review entities"
  ON public.interview_review_entities FOR INSERT
  WITH CHECK (is_project_editor(get_source_project(interview_id)));

CREATE POLICY "Editors can update interview review entities"
  ON public.interview_review_entities FOR UPDATE
  USING (is_project_editor(get_source_project(interview_id)));

CREATE POLICY "Editors can delete interview review entities"
  ON public.interview_review_entities FOR DELETE
  USING (is_project_editor(get_source_project(interview_id)));

-- ── 7. hybrid_search rewrite (both overloads) ───────────────────────────────
-- Drop both overloads first, then re-create with bodies reading source_chunks /
-- source_id. Return shape kept identical (interview_id column preserved) so
-- chat code does not change in this PR.
DROP FUNCTION IF EXISTS public.hybrid_search(vector, uuid[], uuid[], text, text[], double precision, integer);
DROP FUNCTION IF EXISTS public.hybrid_search(vector, uuid[], text, text[], double precision, integer);

CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_embedding vector(1536),
  filter_project_ids UUID[] DEFAULT NULL,
  filter_interview_ids UUID[] DEFAULT NULL,
  filter_country TEXT DEFAULT NULL,
  filter_topics TEXT[] DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  chunk_id     UUID,
  interview_id UUID,
  content      TEXT,
  speaker      TEXT,
  start_time   REAL,
  end_time     REAL,
  metadata     JSONB,
  similarity   FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id           AS chunk_id,
    sc.source_id    AS interview_id,
    sc.content,
    sc.speaker,
    sc.start_time,
    sc.end_time,
    sc.metadata,
    1 - (sc.embedding <=> query_embedding) AS similarity
  FROM public.source_chunks sc
  JOIN public.sources s ON s.id = sc.source_id
  WHERE
    (filter_interview_ids IS NULL OR sc.source_id = ANY(filter_interview_ids))
    AND (filter_project_ids IS NULL OR s.project_id = ANY(filter_project_ids))
    AND (
      filter_country IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = s.project_id AND p.country = filter_country
      )
    )
    AND (
      filter_topics IS NULL
      OR sc.metadata->>'topics' IS NULL
      OR EXISTS (
        SELECT 1
        FROM unnest(filter_topics) ft
        WHERE sc.metadata @> jsonb_build_object('topics', jsonb_build_array(ft))
      )
    )
    AND 1 - (sc.embedding <=> query_embedding) > match_threshold
  ORDER BY sc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.hybrid_search(
  vector, uuid[], uuid[], text, text[], double precision, integer
) IS
  'Vector + topic-filtered chunk search. Reads source_chunks / source_id internally. Return column `interview_id` is kept for one release for back-compat with chat code; will be renamed to source_id in a future PR.';

-- ── 8. Back-compat views ────────────────────────────────────────────────────
-- Read-only by default in Postgres. Writes go to the underlying tables only;
-- every write call site in the application is being moved to the new table
-- names in the same PR. Reads can stay on these names for one release.
CREATE OR REPLACE VIEW public.interviews AS
  SELECT * FROM public.sources;

CREATE OR REPLACE VIEW public.interview_chunks AS
  SELECT
    id,
    source_id AS interview_id,
    chunk_index,
    content,
    speaker,
    start_time,
    end_time,
    embedding,
    metadata,
    created_at
  FROM public.source_chunks;

GRANT SELECT ON public.interviews       TO authenticated, service_role;
GRANT SELECT ON public.interview_chunks TO authenticated, service_role;

COMMENT ON VIEW public.interviews IS
  'DEPRECATED back-compat view over public.sources. Phase 2.1 / migration 00027 (2026-05-06). Drop in a future PR after every reader migrates.';

COMMENT ON VIEW public.interview_chunks IS
  'DEPRECATED back-compat view over public.source_chunks. Aliases source_id AS interview_id for legacy callers. Phase 2.1 / migration 00027 (2026-05-06).';

-- ── 9. Drop the old function names ──────────────────────────────────────────
-- Safe at this point: every RLS policy that referenced get_interview_project
-- has been dropped + re-created against get_source_project in step 6.
-- clear_interview_derived_data has no DB dependents (only application callers,
-- updated in the same PR) but is dropped here for symmetry.
DROP FUNCTION IF EXISTS public.get_interview_project(UUID);
DROP FUNCTION IF EXISTS public.clear_interview_derived_data(UUID);
