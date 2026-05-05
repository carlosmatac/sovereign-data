-- audit §12.16 — Validated positions referencing missing entities
SELECT vp.id, vp.person_entity_id, vp.organization_entity_id
FROM validated_positions vp
LEFT JOIN entities ep ON ep.id = vp.person_entity_id
LEFT JOIN entities eo ON eo.id = vp.organization_entity_id
WHERE ep.id IS NULL
   OR (vp.organization_entity_id IS NOT NULL AND eo.id IS NULL);
