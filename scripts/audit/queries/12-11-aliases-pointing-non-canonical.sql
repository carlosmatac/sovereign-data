-- audit §12.11 — Aliases pointing to non-canonical entities
SELECT a.id, a.alias, a.entity_id, e.canonical_entity_id
FROM entity_aliases a
JOIN entities e ON e.id = a.entity_id
WHERE e.canonical_entity_id IS NOT NULL;
