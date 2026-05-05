-- audit §12.14 — Cycle detection in canonical chain
WITH RECURSIVE chain AS (
  SELECT id, canonical_entity_id, ARRAY[id] AS path
  FROM entities
  WHERE canonical_entity_id IS NOT NULL
  UNION ALL
  SELECT c.id, e.canonical_entity_id, path || e.id
  FROM chain c
  JOIN entities e ON e.id = c.canonical_entity_id
  WHERE NOT (e.id = ANY(path))
    AND array_length(path, 1) < 12
)
SELECT id, path FROM chain
WHERE canonical_entity_id = ANY(path);
