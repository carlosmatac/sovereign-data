-- Immutable ASR diarization (milliseconds) for seeding transcript review timing.
-- reviewed_utterances uses seconds for editor + HTML5 audio; chunk windows live in interview_chunks.

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS source_utterances JSONB;

COMMENT ON COLUMN interviews.source_utterances IS
  'Immutable provider diarized utterances [{ speaker, text, start, end }] in milliseconds (AssemblyAI). Seeds transcript review when reviewed_utterances is empty; not edited in the UI.';

COMMENT ON COLUMN interviews.reviewed_utterances IS
  'Human-edited utterances [{ speaker, text, start, end }]; start/end in seconds (wall-clock, HTML audio currentTime). Sole transcript source for reviewed reprocessing text. Chunk/embeddings timing is interview_chunks.start_time / end_time (seconds).';
