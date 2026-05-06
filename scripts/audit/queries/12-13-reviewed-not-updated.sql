-- audit §12.13 — Reviewed transcripts that did NOT update chunks/embeddings
SELECT i.id, i.title, i.last_intel_source,
       max(c.created_at) AS last_chunk_at,
       jsonb_array_length(i.reviewed_utterances) AS reviewed_count
FROM interviews i
LEFT JOIN interview_chunks c ON c.interview_id = i.id
WHERE i.last_intel_source = 'human_review'
GROUP BY i.id, i.title, i.last_intel_source, i.reviewed_utterances;
