-- ============================================
-- Reports — Investor-Grade BI Report Generation
-- ============================================

CREATE TYPE report_status AS ENUM ('generating', 'completed', 'failed');

CREATE TYPE report_template AS ENUM (
  'country_risk',
  'sector_analysis',
  'entity_profile',
  'executive_briefing',
  'custom'
);

CREATE TABLE reports (
  id           UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,
  template     report_template NOT NULL,
  status       report_status DEFAULT 'generating' NOT NULL,
  content      TEXT,              -- Markdown content of the generated report
  summary      TEXT,              -- Short summary for list view
  interview_ids UUID[] NOT NULL,  -- Source interviews used to generate the report
  parameters   JSONB DEFAULT '{}', -- Template-specific params (topic focus, entity name, etc.)
  error_message TEXT,
  created_by   UUID REFERENCES profiles(id) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_reports_project ON reports(project_id);
CREATE INDEX idx_reports_status ON reports(status);

CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view reports"
  ON reports FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Editors can create reports"
  ON reports FOR INSERT
  WITH CHECK (is_project_editor(project_id));

CREATE POLICY "Editors can update reports"
  ON reports FOR UPDATE
  USING (is_project_editor(project_id));

CREATE POLICY "Owners can delete reports"
  ON reports FOR DELETE
  USING (is_project_owner(project_id));
