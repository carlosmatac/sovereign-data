-- audit §12.12 — Project-scope vs global collisions on the same name
SELECT normalized_name, type,
       array_agg(DISTINCT project_id::text) AS scopes,
       count(*) AS rows
FROM entities
GROUP BY normalized_name, type
HAVING count(DISTINCT COALESCE(project_id::text, 'GLOBAL')) > 1
ORDER BY rows DESC;
