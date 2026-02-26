-- ============================================
-- Report Sharing — Public shareable links
-- ============================================

ALTER TABLE reports
  ADD COLUMN share_token TEXT UNIQUE,
  ADD COLUMN share_password TEXT;

CREATE INDEX idx_reports_share_token ON reports(share_token)
  WHERE share_token IS NOT NULL;
