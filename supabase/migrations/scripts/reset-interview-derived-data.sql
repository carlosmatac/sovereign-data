-- Sovereign Data — reset datos derivados de entrevistas (NO toca esquema ni auth)
-- Ejecutar en Supabase SQL Editor con rol con permisos (p. ej. postgres / service role).
-- NO borra ficheros en Storage; vacía el bucket aparte si quieres audio limpio.
--
-- Opcional: haz backup / snapshot del proyecto antes.

BEGIN;

-- Informes que referencian entrevistas por UUID (sin FK a interviews)
DELETE FROM reports;

-- Entrevistas; ON DELETE CASCADE elimina automáticamente:
--   interview_chunks, entity_mentions, entity_relationships,
--   content_snippets, interview_review_entities
DELETE FROM interviews;

-- Grafo canónico aprendido por la ingesta (recomendado para re-ingesta limpia)
DELETE FROM entity_aliases;
UPDATE entities SET canonical_entity_id = NULL WHERE canonical_entity_id IS NOT NULL;
DELETE FROM entities;

COMMIT;