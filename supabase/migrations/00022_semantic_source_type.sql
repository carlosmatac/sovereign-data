-- ============================================================
-- Migration 00022: semantic_source_type + source_metadata
-- ============================================================
-- Adds semantic classification and source metadata to interviews.
-- Adds 'text' to source_type enum for plain-text ingestion.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction
-- in PostgreSQL. Do not wrap this file in BEGIN/COMMIT.
-- ============================================================

-- Add 'text' to source_type enum (idempotent)
ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'text';

-- Add new columns (idempotent)
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS semantic_source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_metadata JSONB;

-- Backfill existing audio interviews
UPDATE interviews
  SET semantic_source_type = 'interview'
  WHERE source_type = 'audio'
    AND semantic_source_type IS NULL;

-- Backfill existing document interviews
UPDATE interviews
  SET semantic_source_type = 'interview'
  WHERE source_type = 'document'
    AND semantic_source_type IS NULL;
