-- Add interview-level filtering to hybrid_search.
-- When filter_interview_ids is provided, only chunks from those interviews
-- are returned. This powers "this interview" scope control in chat.

CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(1536),
  filter_project_ids UUID[] DEFAULT NULL,
  filter_interview_ids UUID[] DEFAULT NULL,
  filter_country TEXT DEFAULT NULL,
  filter_topics TEXT[] DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  chunk_id UUID,
  interview_id UUID,
  content TEXT,
  speaker TEXT,
  start_time REAL,
  end_time REAL,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ic.id AS chunk_id,
    ic.interview_id,
    ic.content,
    ic.speaker,
    ic.start_time,
    ic.end_time,
    ic.metadata,
    1 - (ic.embedding <=> query_embedding) AS similarity
  FROM interview_chunks ic
  JOIN interviews i ON i.id = ic.interview_id
  WHERE
    (filter_interview_ids IS NULL OR ic.interview_id = ANY(filter_interview_ids))
    AND (filter_project_ids IS NULL OR i.project_id = ANY(filter_project_ids))
    AND (filter_country IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = i.project_id AND p.country = filter_country))
    AND (filter_topics IS NULL OR ic.metadata->>'topics' IS NULL OR EXISTS (SELECT 1 FROM unnest(filter_topics) ft WHERE ic.metadata @> jsonb_build_object('topics', jsonb_build_array(ft))))
    AND 1 - (ic.embedding <=> query_embedding) > match_threshold
  ORDER BY ic.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
