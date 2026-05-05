-- audit §12.4 — Mentions without source links (legacy pre-gate rows)
SELECT em.id, em.entity_id, em.interview_id, em.created_at, e.name
FROM entity_mentions em
JOIN entities e ON e.id = em.entity_id
WHERE em.chunk_id IS NULL
ORDER BY em.created_at;
