-- audit §12.7 — Chunks with no embedding
SELECT id, interview_id, chunk_index, length(content) AS chars
FROM interview_chunks
WHERE embedding IS NULL;
