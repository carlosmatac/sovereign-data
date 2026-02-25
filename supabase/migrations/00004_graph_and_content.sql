-- ============================================
-- Phase 2.5: Graph & Content Evolution
-- ============================================
-- Adds:
--   1. source_type column on interviews (multi-modal prep)
--   2. entity_relationships table (GraphRAG edges)
--   3. content_snippets table (marketing automation)
--
-- All changes are additive. No existing columns or
-- tables are dropped or renamed.
-- ============================================


-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE relation_type AS ENUM (
  'business_partner',
  'competitor',
  'regulator',
  'critic',
  'ally',
  'subsidiary',
  'investor',
  'advisor',
  'supplier',
  'acquirer'
);

CREATE TYPE source_type AS ENUM (
  'audio',
  'document',
  'video'
);

CREATE TYPE snippet_platform AS ENUM (
  'linkedin',
  'twitter',
  'newsletter',
  'summary'
);

CREATE TYPE snippet_tone AS ENUM (
  'professional',
  'casual',
  'provocative'
);

CREATE TYPE snippet_status AS ENUM (
  'draft',
  'approved',
  'published'
);


-- ============================================
-- 1. INTERVIEWS: add source_type column
-- ============================================

ALTER TABLE interviews
  ADD COLUMN source_type source_type NOT NULL DEFAULT 'audio';


-- ============================================
-- 2. ENTITY RELATIONSHIPS (Knowledge Graph edges)
-- ============================================

CREATE TABLE entity_relationships (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  source_entity_id  UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  target_entity_id  UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  relation_type     relation_type NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0.5
                    CHECK (confidence >= 0 AND confidence <= 1),
  evidence_text     TEXT,
  interview_id      UUID REFERENCES interviews(id) ON DELETE CASCADE NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(source_entity_id, target_entity_id, relation_type, interview_id)
);

CREATE INDEX idx_entity_rel_source ON entity_relationships(source_entity_id);
CREATE INDEX idx_entity_rel_target ON entity_relationships(target_entity_id);
CREATE INDEX idx_entity_rel_interview ON entity_relationships(interview_id);
CREATE INDEX idx_entity_rel_type ON entity_relationships(relation_type);


-- ============================================
-- 3. CONTENT SNIPPETS (Marketing automation)
-- ============================================

CREATE TABLE content_snippets (
  id            UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  interview_id  UUID REFERENCES interviews(id) ON DELETE CASCADE NOT NULL,
  platform      snippet_platform NOT NULL,
  content       TEXT NOT NULL,
  tone          snippet_tone NOT NULL DEFAULT 'professional',
  status        snippet_status NOT NULL DEFAULT 'draft',
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_snippets_interview ON content_snippets(interview_id);
CREATE INDEX idx_snippets_platform ON content_snippets(platform);
CREATE INDEX idx_snippets_status ON content_snippets(status);


-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_content_snippets_updated_at
  BEFORE UPDATE ON content_snippets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view entity relationships"
  ON entity_relationships FOR SELECT
  USING (is_project_member(get_interview_project(interview_id)));

CREATE POLICY "Authenticated users can insert entity relationships"
  ON entity_relationships FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update entity relationships"
  ON entity_relationships FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Members can view content snippets"
  ON content_snippets FOR SELECT
  USING (is_project_member(get_interview_project(interview_id)));

CREATE POLICY "Authenticated users can insert content snippets"
  ON content_snippets FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update content snippets"
  ON content_snippets FOR UPDATE
  USING (auth.uid() IS NOT NULL);
