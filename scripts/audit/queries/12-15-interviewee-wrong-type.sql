-- audit §12.15 — Interviews whose interviewee_entity_id points at a different `type` than expected
SELECT i.id, i.title, e.id AS entity_id, e.type
FROM interviews i
JOIN entities e ON e.id = i.interviewee_entity_id
WHERE e.type <> 'PERSON';
