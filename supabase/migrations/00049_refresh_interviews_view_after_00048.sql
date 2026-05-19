-- ============================================================================
-- 00049 — refresh back-compat interviews view after 00048 column additions
-- ============================================================================
-- Migration 00048 added interviewee_relationship_types and
-- participant_anchor_relationships to public.sources.
-- Postgres does NOT expand SELECT * views when the base table gains columns
-- (see 00036 / 00041). Pipeline queries against public.interviews that
-- reference the new columns fail at PostgREST level, returning null rows.
-- ============================================================================

CREATE OR REPLACE VIEW public.interviews AS
  SELECT * FROM public.sources;

GRANT SELECT ON public.interviews TO authenticated, service_role;

COMMENT ON VIEW public.interviews IS
  'DEPRECATED back-compat view over public.sources. Refreshed in 00049 after interviewee_relationship_types (00048).';
