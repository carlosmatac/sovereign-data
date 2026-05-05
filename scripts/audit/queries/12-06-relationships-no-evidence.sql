-- audit §12.6 — Relationships with no evidence quote
SELECT id, interview_id, source_entity_id, target_entity_id, relation_type
FROM entity_relationships
WHERE evidence_text IS NULL
   OR length(btrim(evidence_text)) = 0;
