-- audit §12.3 — Entities without any mentions (orphans)
SELECT e.id, e.name, e.type, e.project_id
FROM entities e
LEFT JOIN entity_mentions em ON em.entity_id = e.id
WHERE em.id IS NULL
  AND e.canonical_entity_id IS NULL;
