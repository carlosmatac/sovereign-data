-- ============================================
-- Interview Primary Entity Anchors
-- ============================================
-- Adds optional anchors captured at upload time:
-- - interviewee_name (primary person)
-- - interviewee_org  (primary organization/company)
-- ============================================

ALTER TABLE interviews
  ADD COLUMN interviewee_name TEXT,
  ADD COLUMN interviewee_org TEXT;
