-- audit §12.10 — Duplicate canonical entities (same normalized_name + type, different rows)
SELECT normalized_name, type, count(*) AS dupes,
       array_agg(id ORDER BY created_at) AS ids
FROM entities
WHERE canonical_entity_id IS NULL
GROUP BY normalized_name, type
HAVING count(*) > 1
ORDER BY count(*) DESC, normalized_name;
