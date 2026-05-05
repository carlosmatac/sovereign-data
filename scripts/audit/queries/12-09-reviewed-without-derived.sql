-- audit §12.9 — Reviewed interviews left without derived data
SELECT i.id, i.title, i.status, i.transcript_review_status, i.last_intel_source,
       (SELECT count(*) FROM interview_chunks c WHERE c.interview_id = i.id) AS chunks,
       (SELECT count(*) FROM entity_mentions m WHERE m.interview_id = i.id) AS mentions,
       (SELECT count(*) FROM entity_relationships r WHERE r.interview_id = i.id) AS rels
FROM interviews i
WHERE i.transcript_review_status IN ('reprocessing','ready')
ORDER BY i.updated_at DESC;
