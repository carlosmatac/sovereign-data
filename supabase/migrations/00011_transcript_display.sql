-- ============================================
-- Transcript Display Layer
-- ============================================
-- Keeps transcript_full as immutable raw evidence and
-- stores a cleaned display variant for UX consistency.
-- ============================================

ALTER TABLE interviews
  ADD COLUMN transcript_display TEXT;
