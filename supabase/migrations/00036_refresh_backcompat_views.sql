-- ============================================================================
-- 00036 — refresh back-compat views after tenant_id column additions
-- ============================================================================
-- Migration 00027 created two back-compat views:
--   • interviews  — SELECT * FROM sources
--   • interview_chunks — explicit column list from source_chunks
--
-- Migration 00033 added tenant_id to sources and source_chunks.
-- Postgres does NOT automatically expand a view's SELECT * when the
-- underlying table gains a new column — it captures the column list at
-- view creation time. The result: `from("interviews")` queries that include
-- `tenant_id` (e.g. reprocessInterviewFromReview) fail at PostgREST level
-- with "column interviews.tenant_id does not exist".
--
-- Fix: recreate both views so they include the new column.
-- ============================================================================

-- interviews: re-expand SELECT * to pick up tenant_id (and any future columns)
CREATE OR REPLACE VIEW public.interviews AS
  SELECT * FROM public.sources;

-- interview_chunks: Postgres requires DROP + CREATE to add a column to an
-- existing view (CREATE OR REPLACE only allows appending at the end; inserting
-- in the middle yields "cannot change name of view column").
-- No application code reads tenant_id from this view today, but adding it
-- keeps the view consistent with source_chunks and avoids future surprises.
-- CASCADE drops nothing extra — no other objects depend on this view.
DROP VIEW IF EXISTS public.interview_chunks;

CREATE VIEW public.interview_chunks AS
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
    created_at,
    tenant_id
  FROM public.source_chunks;

-- Re-grant (idempotent — grants don't stack on views)
GRANT SELECT ON public.interviews       TO authenticated, service_role;
GRANT SELECT ON public.interview_chunks TO authenticated, service_role;

COMMENT ON VIEW public.interviews IS
  'DEPRECATED back-compat view over public.sources. Includes tenant_id (refreshed in 00036 after 00033 added the column). Drop in a future PR after every reader migrates.';

COMMENT ON VIEW public.interview_chunks IS
  'DEPRECATED back-compat view over public.source_chunks. Aliases source_id AS interview_id for legacy callers. Includes tenant_id (refreshed in 00036). Drop in a future PR.';
