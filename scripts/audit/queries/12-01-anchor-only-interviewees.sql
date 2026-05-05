-- audit §12.1 — Anchor-only interviewees (the known-symptom probe)
-- Interviews whose interviewee_entity_id is set but where that entity has
-- zero entity_mentions for that interview.
SELECT i.id AS interview_id,
       i.title,
       i.interviewee_entity_id,
       e.name AS interviewee_name
FROM interviews i
LEFT JOIN entities e ON e.id = i.interviewee_entity_id
LEFT JOIN entity_mentions em
       ON em.interview_id = i.id
      AND em.entity_id = i.interviewee_entity_id
WHERE i.interviewee_entity_id IS NOT NULL
  AND i.status = 'COMPLETED'
  AND em.id IS NULL
ORDER BY i.created_at DESC;
