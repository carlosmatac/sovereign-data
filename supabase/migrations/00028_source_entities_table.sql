-- ============================================================================
-- 00028 — source_entities table + anchor backfill (Phase 2.2 / PR 2.2)
-- ============================================================================
-- Introduces the canonical, source-level (source, entity) association table
-- the audit's clarification §3.4 mandates. Today the only edges between
-- `sources` and `entities` are the two anchor FK columns
-- (`sources.interviewee_entity_id`, `sources.interviewee_org_entity_id`) and
-- chunk-level `entity_mentions`. The April 2026 persistence gate intentionally
-- drops anchor / fuzzy mentions, so an interviewee can have ZERO mentions on
-- the very source where they are the interviewee. This table is the place
-- where source-level associations live and survive the gate by design.
--
-- Two enums encode the link semantics:
--   * `source_entity_link_type` — WHAT the link is.
--   * `source_entity_origin`    — HOW the link was learned.
--
-- The unique key `(source_id, entity_id, link_type, origin)` lets multiple
-- provenance rows coexist for the same logical association — e.g. an anchor
-- row and an extraction row for the same person on the same source are both
-- intended (per plan §10 #8).
--
-- THIS PR IS SCHEMA-ONLY.
--   * No app code writes `source_entities` yet (PR 2.3).
--   * `entity_intel` is not rewritten yet (PR 2.4).
--   * `sources.interviewee_*_entity_id` columns remain authoritative for one
--     full release window (back-compat `interviews` view exposes them).
--
-- Every step below is guarded so reruns after a partial failure are safe.
-- ============================================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_entity_link_type') THEN
    CREATE TYPE source_entity_link_type AS ENUM (
      'interviewee',
      'interviewee_org',
      'interviewer',
      'translator',
      'participant',
      'author',
      'primary_subject',
      'subject_organization',
      'account',
      'source_owner',
      'mentioned_at_source_level',
      'related_entity'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_entity_origin') THEN
    CREATE TYPE source_entity_origin AS ENUM (
      'upload_anchor',
      'metadata_import',
      'extraction',
      'crm_import',
      'manual_tag',
      'ai_inference',
      'human_review',
      'alias_propagation',
      'prior_context'
    );
  END IF;
END$$;

-- ── 2. Table ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.source_entities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID NOT NULL REFERENCES public.sources(id)  ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  link_type       source_entity_link_type NOT NULL,
  origin          source_entity_origin    NOT NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  speaker_label   TEXT,
  source_metadata JSONB,
  evidence        JSONB,
  confidence      REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT source_entities_quad_uniq UNIQUE (source_id, entity_id, link_type, origin)
);

COMMENT ON TABLE  public.source_entities IS
  'Source-level (source, entity) association layer. UNIQUE quad (source_id, entity_id, link_type, origin) allows multiple provenance rows per logical association.';
COMMENT ON COLUMN public.source_entities.link_type IS 'What the link is (interviewee, author, primary_subject, ...).';
COMMENT ON COLUMN public.source_entities.origin    IS 'How the link was learned (upload_anchor, extraction, manual_tag, crm_import, ...).';
COMMENT ON COLUMN public.source_entities.confidence IS 'NULL for deterministic origins (upload_anchor, metadata_import, manual_tag); 0..1 for extraction / ai_inference.';

-- ── 3. Indexes ──────────────────────────────────────────────────────────────
-- (PK + the quad UNIQUE already give us one btree on id and one on the quad.)

CREATE INDEX IF NOT EXISTS idx_source_entities_entity
  ON public.source_entities (entity_id);

CREATE INDEX IF NOT EXISTS idx_source_entities_source_link
  ON public.source_entities (source_id, link_type);

CREATE INDEX IF NOT EXISTS idx_source_entities_source_origin
  ON public.source_entities (source_id, origin);

-- ── 4. updated_at trigger ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS update_source_entities_updated_at ON public.source_entities;
CREATE TRIGGER update_source_entities_updated_at
  BEFORE UPDATE ON public.source_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
-- Pattern mirrors `interview_review_entities` (00013) post-rename: SELECT for
-- project members, INSERT/UPDATE/DELETE for editors. The admin client (service
-- role) bypasses RLS — sacred per HANDOVER.md.

ALTER TABLE public.source_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view source entities"   ON public.source_entities;
DROP POLICY IF EXISTS "Editors can insert source entities" ON public.source_entities;
DROP POLICY IF EXISTS "Editors can update source entities" ON public.source_entities;
DROP POLICY IF EXISTS "Editors can delete source entities" ON public.source_entities;

CREATE POLICY "Members can view source entities"
  ON public.source_entities FOR SELECT
  USING (is_project_member(get_source_project(source_id)));

CREATE POLICY "Editors can insert source entities"
  ON public.source_entities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND is_project_editor(get_source_project(source_id)));

CREATE POLICY "Editors can update source entities"
  ON public.source_entities FOR UPDATE
  USING (is_project_editor(get_source_project(source_id)));

CREATE POLICY "Editors can delete source entities"
  ON public.source_entities FOR DELETE
  USING (is_project_editor(get_source_project(source_id)));

-- ── 6. Backfill (idempotent) ────────────────────────────────────────────────
-- One row per non-NULL anchor on `sources`. Rerunning is safe via the quad
-- UNIQUE + ON CONFLICT DO NOTHING.

INSERT INTO public.source_entities
  (source_id, entity_id, link_type, origin, is_primary, confidence)
SELECT s.id, s.interviewee_entity_id,
       'interviewee'::source_entity_link_type,
       'upload_anchor'::source_entity_origin,
       true,
       NULL
FROM public.sources s
WHERE s.interviewee_entity_id IS NOT NULL
ON CONFLICT (source_id, entity_id, link_type, origin) DO NOTHING;

INSERT INTO public.source_entities
  (source_id, entity_id, link_type, origin, is_primary, confidence)
SELECT s.id, s.interviewee_org_entity_id,
       'interviewee_org'::source_entity_link_type,
       'upload_anchor'::source_entity_origin,
       false,
       NULL
FROM public.sources s
WHERE s.interviewee_org_entity_id IS NOT NULL
ON CONFLICT (source_id, entity_id, link_type, origin) DO NOTHING;

-- ── 7. Backfill assertion (non-fatal NOTICE for migration logs) ─────────────
-- The dry-run probe AND the post-push verification re-check the same
-- invariants programmatically. Raising a NOTICE here means the migration log
-- carries the deltas without aborting on the (currently expected) zero-row
-- anchor counts.

DO $$
DECLARE
  expected_interviewee     INTEGER;
  expected_interviewee_org INTEGER;
  actual_interviewee       INTEGER;
  actual_interviewee_org   INTEGER;
BEGIN
  SELECT COUNT(*) INTO expected_interviewee
    FROM public.sources WHERE interviewee_entity_id IS NOT NULL;
  SELECT COUNT(*) INTO expected_interviewee_org
    FROM public.sources WHERE interviewee_org_entity_id IS NOT NULL;
  SELECT COUNT(*) INTO actual_interviewee
    FROM public.source_entities
    WHERE link_type = 'interviewee' AND origin = 'upload_anchor';
  SELECT COUNT(*) INTO actual_interviewee_org
    FROM public.source_entities
    WHERE link_type = 'interviewee_org' AND origin = 'upload_anchor';

  RAISE NOTICE
    'source_entities backfill: interviewee % / % ; interviewee_org % / %',
    actual_interviewee,     expected_interviewee,
    actual_interviewee_org, expected_interviewee_org;

  IF actual_interviewee <> expected_interviewee THEN
    RAISE EXCEPTION
      'source_entities backfill mismatch: interviewee actual=% expected=%',
      actual_interviewee, expected_interviewee;
  END IF;
  IF actual_interviewee_org <> expected_interviewee_org THEN
    RAISE EXCEPTION
      'source_entities backfill mismatch: interviewee_org actual=% expected=%',
      actual_interviewee_org, expected_interviewee_org;
  END IF;
END$$;
