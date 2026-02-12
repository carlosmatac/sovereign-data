-- ============================================
-- Sovereign Data — Initial Database Schema
-- ============================================
-- This migration creates the full schema for the
-- Frontier Markets Intelligence Platform MVP.
--
-- Requires: pgvector extension (enabled below)
-- ============================================

-- ============================================
-- Sovereign Data — Initial Database Schema (FIXED)
-- ============================================

-- 1. Enable ALL required extensions FIRST
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions"; -- Moved to top to fix "gin_trgm_ops" error

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE interview_status AS ENUM (
  'UPLOADING',
  'PROCESSING',
  'TRANSCRIBING',
  'EXTRACTING',
  'EMBEDDING',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE entity_type AS ENUM (
  'PERSON',
  'COMPANY',
  'GOVERNMENT',
  'ORGANIZATION',
  'LOCATION',
  'EVENT'
);

CREATE TYPE user_role AS ENUM (
  'owner',
  'editor',
  'viewer'
);

-- ============================================
-- PROFILES TABLE (extends Supabase Auth)
-- ============================================

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- PROJECTS TABLE (RLS Root)
-- ============================================

CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  country     TEXT,
  region      TEXT,
  created_by  UUID REFERENCES profiles(id) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- PROJECT MEMBERS (Many-to-Many: User <-> Project)
-- ============================================

CREATE TABLE project_members (
  id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role        user_role DEFAULT 'viewer' NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, user_id)
);

-- ============================================
-- INTERVIEWS TABLE
-- ============================================

CREATE TABLE interviews (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  audio_url       TEXT,
  audio_duration  INTEGER, -- duration in seconds
  status          interview_status DEFAULT 'UPLOADING' NOT NULL,
  error_message   TEXT,

  -- Speaker identification
  speaker_map     JSONB DEFAULT '{}', -- {"Speaker A": "Minister John", "Speaker B": "Editor Name"}

  -- AI-generated content
  transcript_full TEXT,
  summary         TEXT,
  sentiment       JSONB, -- {"overall": "positive", "score": 0.8, "highlights": [...]}
  topics          TEXT[], -- extracted topic tags

  -- External references
  assemblyai_id   TEXT, -- AssemblyAI transcript ID for polling/webhook

  -- Metadata
  language        TEXT DEFAULT 'en',
  conducted_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES profiles(id) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for status-based queries (e.g., "show me all processing interviews")
CREATE INDEX idx_interviews_status ON interviews(status);
CREATE INDEX idx_interviews_project ON interviews(project_id);

-- ============================================
-- INTERVIEW CHUNKS (Vector Store)
-- ============================================

CREATE TABLE interview_chunks (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  interview_id    UUID REFERENCES interviews(id) ON DELETE CASCADE NOT NULL,
  chunk_index     INTEGER NOT NULL, -- ordering within the interview
  content         TEXT NOT NULL,
  speaker         TEXT, -- "Speaker A", "Minister John", etc.
  start_time      REAL, -- seconds from start of audio
  end_time        REAL, -- seconds from start of audio
  embedding       vector(1536), -- OpenAI text-embedding-3-small

  -- Denormalized metadata for pre-filtering in RAG queries
  metadata        JSONB DEFAULT '{}', -- {country, topics, entities, ...}

  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX idx_chunks_embedding ON interview_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_chunks_interview ON interview_chunks(interview_id);
CREATE INDEX idx_chunks_metadata ON interview_chunks USING gin(metadata jsonb_path_ops);

-- ============================================
-- ENTITIES TABLE (Knowledge Graph Lite)
-- ============================================

CREATE TABLE entities (
  id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name        TEXT NOT NULL,
  type        entity_type NOT NULL,
  description TEXT,
  metadata    JSONB DEFAULT '{}', -- {title, affiliation, country, ...}
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(name, type)
);

CREATE INDEX idx_entities_type ON entities(type);
-- This index required pg_trgm to be enabled first
CREATE INDEX idx_entities_name ON entities USING gin(name gin_trgm_ops);

-- ============================================
-- ENTITY MENTIONS (Interview <-> Entity link)
-- ============================================

CREATE TABLE entity_mentions (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  interview_id    UUID REFERENCES interviews(id) ON DELETE CASCADE NOT NULL,
  chunk_id        UUID REFERENCES interview_chunks(id) ON DELETE CASCADE,
  context         TEXT, -- surrounding text snippet
  sentiment       TEXT, -- positive/negative/neutral toward this entity
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(entity_id, interview_id, chunk_id)
);

CREATE INDEX idx_mentions_entity ON entity_mentions(entity_id);
CREATE INDEX idx_mentions_interview ON entity_mentions(interview_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_mentions ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Projects
CREATE POLICY "Members can view projects" ON projects FOR SELECT USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid())
);
CREATE POLICY "Owners can update projects" ON projects FOR UPDATE USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid() AND project_members.role = 'owner')
);
CREATE POLICY "Authenticated users can create projects" ON projects FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners can delete projects" ON projects FOR DELETE USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid() AND project_members.role = 'owner')
);

-- Project Members
CREATE POLICY "Members can view project members" ON project_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM project_members AS pm WHERE pm.project_id = project_members.project_id AND pm.user_id = auth.uid())
);
CREATE POLICY "Owners can manage project members" ON project_members FOR ALL USING (
  EXISTS (SELECT 1 FROM project_members AS pm WHERE pm.project_id = project_members.project_id AND pm.user_id = auth.uid() AND pm.role = 'owner')
);

-- Interviews
CREATE POLICY "Members can view interviews" ON interviews FOR SELECT USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = interviews.project_id AND project_members.user_id = auth.uid())
);
CREATE POLICY "Editors can create interviews" ON interviews FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = interviews.project_id AND project_members.user_id = auth.uid() AND project_members.role IN ('owner', 'editor'))
);
CREATE POLICY "Editors can update interviews" ON interviews FOR UPDATE USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = interviews.project_id AND project_members.user_id = auth.uid() AND project_members.role IN ('owner', 'editor'))
);

-- Interview Chunks
CREATE POLICY "Members can view chunks" ON interview_chunks FOR SELECT USING (
  EXISTS (SELECT 1 FROM interviews JOIN project_members ON project_members.project_id = interviews.project_id WHERE interviews.id = interview_chunks.interview_id AND project_members.user_id = auth.uid())
);

-- Entities
CREATE POLICY "Authenticated users can view entities" ON entities FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "System can manage entities" ON entities FOR ALL USING (auth.uid() IS NOT NULL);

-- Entity Mentions
CREATE POLICY "Members can view entity mentions" ON entity_mentions FOR SELECT USING (
  EXISTS (SELECT 1 FROM interviews JOIN project_members ON project_members.project_id = interviews.project_id WHERE interviews.id = entity_mentions.interview_id AND project_members.user_id = auth.uid())
);

-- ============================================
-- HELPER FUNCTIONS & TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION add_project_owner() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_members (project_id, user_id, role) VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_project_created AFTER INSERT ON projects FOR EACH ROW EXECUTE FUNCTION add_project_owner();

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_interviews_updated_at BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_entities_updated_at BEFORE UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- HYBRID SEARCH FUNCTION (RAG)
-- ============================================

CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(1536),
  filter_project_ids UUID[] DEFAULT NULL,
  filter_country TEXT DEFAULT NULL,
  filter_topics TEXT[] DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  chunk_id UUID,
  interview_id UUID,
  content TEXT,
  speaker TEXT,
  start_time REAL,
  end_time REAL,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ic.id AS chunk_id,
    ic.interview_id,
    ic.content,
    ic.speaker,
    ic.start_time,
    ic.end_time,
    ic.metadata,
    1 - (ic.embedding <=> query_embedding) AS similarity
  FROM interview_chunks ic
  JOIN interviews i ON i.id = ic.interview_id
  WHERE
    (filter_project_ids IS NULL OR i.project_id = ANY(filter_project_ids))
    AND (filter_country IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = i.project_id AND p.country = filter_country))
    AND (filter_topics IS NULL OR ic.metadata->>'topics' IS NULL OR EXISTS (SELECT 1 FROM unnest(filter_topics) ft WHERE ic.metadata @> jsonb_build_object('topics', jsonb_build_array(ft))))
    AND 1 - (ic.embedding <=> query_embedding) > match_threshold
  ORDER BY ic.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
