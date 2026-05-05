-- audit §12.5 — Relationships whose endpoint entity is missing
SELECT er.id
FROM entity_relationships er
LEFT JOIN entities s ON s.id = er.source_entity_id
LEFT JOIN entities t ON t.id = er.target_entity_id
WHERE s.id IS NULL OR t.id IS NULL;
