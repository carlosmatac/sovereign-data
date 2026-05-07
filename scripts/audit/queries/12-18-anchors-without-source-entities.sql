-- audit §12.18 — Anchors without matching source_entities row (PR 2.3+).
-- Sources whose interviewee_entity_id (or interviewee_org_entity_id) is set
-- but for which no source_entities row exists with the corresponding
-- (link_type, origin='upload_anchor') tuple. Should be zero once PR 2.3
-- pipeline writes start running on every ingest. Older sources processed
-- before PR 2.3 will appear here until they are reprocessed or backfilled
-- — that's a known limitation of PR 2.3 (Q5 deferred backfill).
WITH person_gap AS (
  SELECT s.id AS source_id, s.title, s.interviewee_entity_id AS entity_id, 'interviewee'::text AS link_type
  FROM public.sources s
  WHERE s.interviewee_entity_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.source_entities se
      WHERE se.source_id = s.id
        AND se.entity_id = s.interviewee_entity_id
        AND se.link_type = 'interviewee'
        AND se.origin = 'upload_anchor'
    )
), org_gap AS (
  SELECT s.id AS source_id, s.title, s.interviewee_org_entity_id AS entity_id, 'interviewee_org'::text AS link_type
  FROM public.sources s
  WHERE s.interviewee_org_entity_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.source_entities se
      WHERE se.source_id = s.id
        AND se.entity_id = s.interviewee_org_entity_id
        AND se.link_type = 'interviewee_org'
        AND se.origin = 'upload_anchor'
    )
)
SELECT * FROM person_gap
UNION ALL
SELECT * FROM org_gap
ORDER BY source_id, link_type;
