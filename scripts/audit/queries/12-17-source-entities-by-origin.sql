-- audit §12.17 — source_entities population by origin (PR 2.3 onward).
-- Aggregate count of source_entities rows grouped by origin enum. Tracks
-- the effect of pipeline writes added in PR 2.3 (upload_anchor +
-- extraction). Other origins (manual_tag, crm_import, human_review,
-- ai_inference, alias_propagation, prior_context, metadata_import) come
-- from later phases and should remain at 0 for now.
SELECT origin,
       COUNT(*) AS row_count
FROM public.source_entities
GROUP BY origin
ORDER BY row_count DESC, origin ASC;
