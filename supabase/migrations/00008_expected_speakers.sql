-- Migration 00008: Add expected_speakers to interviews
--
-- Supports "Dynamic Speaker Input" feature: users can specify the expected
-- number of speakers before uploading, which is forwarded to AssemblyAI as
-- `speakers_expected` to reduce diarization over-segmentation.

ALTER TABLE interviews
  ADD COLUMN expected_speakers integer;

-- Constrain to a sensible range (1–10) when a value is provided.
-- NULL means "auto-detect" (AssemblyAI default behaviour).
ALTER TABLE interviews
  ADD CONSTRAINT chk_expected_speakers
  CHECK (expected_speakers IS NULL OR (expected_speakers >= 1 AND expected_speakers <= 10));
