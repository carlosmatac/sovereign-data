-- Optional interviewee job title / role captured at upload (metadata only).
-- Not used for validated_positions, extraction prompts, or AssemblyAI word_boost.

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS interviewee_title TEXT;

COMMENT ON COLUMN interviews.interviewee_title IS
  'Optional free-text role/title at upload. Editorial metadata; not a source of truth for validated_positions.';
