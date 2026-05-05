-- audit §12.8 — Interviews stuck mid-pipeline
SELECT id, title, status, transcript_review_status, last_intel_source,
       error_message, updated_at
FROM interviews
WHERE status NOT IN ('COMPLETED','FAILED','UPLOADING','PROCESSING','TRANSCRIBING')
  AND updated_at < now() - interval '1 hour';
