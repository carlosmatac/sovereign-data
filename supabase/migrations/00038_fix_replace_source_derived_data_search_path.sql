-- Migration 00038: Fix replace_source_derived_data — add extensions to search_path
--
-- The function casts embedding text to ::vector, but the vector extension is
-- installed in the extensions schema. With SET search_path = public the type
-- cannot be resolved and every reprocess call fails with
-- "type vector does not exist".
--
-- Fix: extend the search path to include extensions so the cast resolves.
-- The public schema remains first, preserving the SECURITY DEFINER safety
-- convention from HANDOVER.md.

CREATE OR REPLACE FUNCTION public.replace_source_derived_data(
  p_source_id     uuid,
  p_chunks        jsonb,
  p_mentions      jsonb,
  p_relationships jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- ── Resolve tenant_id — errors if source not found ───────────────────
  SELECT tenant_id INTO STRICT v_tenant_id
  FROM public.sources
  WHERE id = p_source_id;

  -- ── DELETE old derived data ──────────────────────────────────────────
  -- Mirrors clear_source_derived_data semantics exactly:
  --   • Preserves editorial relationships (approved / rejected / human_edited)
  --   • Preserves non-extraction source_entities
  --   • Clears content_snippets so generateContentSnippets starts clean

  DELETE FROM public.entity_relationships
  WHERE interview_id = p_source_id
    AND review_status = 'pending'
    AND origin = 'llm';

  DELETE FROM public.entity_mentions
  WHERE interview_id = p_source_id;

  DELETE FROM public.source_chunks
  WHERE source_id = p_source_id;

  DELETE FROM public.content_snippets
  WHERE interview_id = p_source_id;

  DELETE FROM public.source_entities
  WHERE source_id = p_source_id
    AND origin = 'extraction';

  -- ── INSERT new source_chunks ──────────────────────────────────────────
  -- Embedding is stored as a JSON string "[0.1, 0.2, ...]" by the pipeline
  -- (JSON.stringify of a float array). The ->> operator returns that as
  -- text, which pgvector casts directly via ::vector.
  INSERT INTO public.source_chunks (
    id, source_id, tenant_id, chunk_index, content,
    speaker, start_time, end_time, embedding, metadata
  )
  SELECT
    (c->>'id')::uuid,
    p_source_id,
    v_tenant_id,
    (c->>'chunk_index')::int,
    c->>'content',
    NULLIF(c->>'speaker', ''),
    NULLIF(c->>'start_time', '')::numeric,
    NULLIF(c->>'end_time', '')::numeric,
    (c->>'embedding')::vector,
    COALESCE((c->'metadata'), '{}')::jsonb
  FROM jsonb_array_elements(p_chunks) AS c;

  -- ── INSERT new entity_mentions ────────────────────────────────────────
  -- ON CONFLICT DO NOTHING: persistence gate guarantees no duplicates in the
  -- payload, but belt-and-braces for pre-existing grounded mentions.
  INSERT INTO public.entity_mentions (
    id, entity_id, interview_id, chunk_id, tenant_id, context, sentiment
  )
  SELECT
    (m->>'id')::uuid,
    (m->>'entity_id')::uuid,
    p_source_id,
    NULLIF(m->>'chunk_id', '')::uuid,
    v_tenant_id,
    NULLIF(m->>'context', ''),
    NULLIF(m->>'sentiment', '')
  FROM jsonb_array_elements(p_mentions) AS m
  ON CONFLICT DO NOTHING;

  -- ── INSERT new entity_relationships ──────────────────────────────────
  -- ON CONFLICT DO NOTHING: protects approved/human_edited rows that the
  -- persistence gate kept alive (same guard as the upsert in pipeline.ts).
  -- All new rows are LLM-origin / pending — editorial history is preserved.
  INSERT INTO public.entity_relationships (
    id, source_entity_id, target_entity_id, relation_type,
    interview_id, tenant_id, confidence, evidence_text,
    review_status, origin
  )
  SELECT
    (r->>'id')::uuid,
    (r->>'source_entity_id')::uuid,
    (r->>'target_entity_id')::uuid,
    (r->>'relation_type')::relation_type,
    p_source_id,
    v_tenant_id,
    NULLIF(r->>'confidence', '')::numeric,
    NULLIF(r->>'evidence_text', ''),
    'pending'::relationship_review_status,
    'llm'::relationship_origin
  FROM jsonb_array_elements(p_relationships) AS r
  ON CONFLICT DO NOTHING;

END;
$$;

REVOKE ALL   ON FUNCTION public.replace_source_derived_data(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_source_derived_data(uuid, jsonb, jsonb, jsonb) TO service_role;
