-- ============================================
-- Fix: Infinite recursion in RLS policies
-- ============================================
-- Problem: project_members policies query project_members itself,
-- triggering RLS checks recursively. Other tables' policies also
-- query project_members, hitting the same recursion.
--
-- Solution: SECURITY DEFINER helper functions that bypass RLS
-- when checking membership, used by all policies.
-- ============================================

-- ── Helper Functions (bypass RLS) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_editor(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'editor')
  );
$$;

-- Helper to get project_id from an interview (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_interview_project(p_interview_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT project_id FROM interviews WHERE id = p_interview_id;
$$;

-- ── Drop ALL existing policies ───────────────────────────────────

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- projects
DROP POLICY IF EXISTS "Members can view projects" ON projects;
DROP POLICY IF EXISTS "Owners can update projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can create projects" ON projects;
DROP POLICY IF EXISTS "Owners can delete projects" ON projects;

-- project_members
DROP POLICY IF EXISTS "Members can view project members" ON project_members;
DROP POLICY IF EXISTS "Owners can manage project members" ON project_members;

-- interviews
DROP POLICY IF EXISTS "Members can view interviews" ON interviews;
DROP POLICY IF EXISTS "Editors can create interviews" ON interviews;
DROP POLICY IF EXISTS "Editors can update interviews" ON interviews;

-- interview_chunks
DROP POLICY IF EXISTS "Members can view chunks" ON interview_chunks;

-- entities
DROP POLICY IF EXISTS "Authenticated users can view entities" ON entities;
DROP POLICY IF EXISTS "System can manage entities" ON entities;

-- entity_mentions
DROP POLICY IF EXISTS "Members can view entity mentions" ON entity_mentions;

-- ── Recreate ALL policies using helper functions ─────────────────

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Projects: membership checked via SECURITY DEFINER function
CREATE POLICY "Members can view projects"
  ON projects FOR SELECT
  USING (is_project_member(id));

CREATE POLICY "Owners can update projects"
  ON projects FOR UPDATE
  USING (is_project_owner(id));

CREATE POLICY "Authenticated users can create projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can delete projects"
  ON projects FOR DELETE
  USING (is_project_owner(id));

-- Project Members: NO self-referencing queries
CREATE POLICY "Members can view project members"
  ON project_members FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Owners can insert project members"
  ON project_members FOR INSERT
  WITH CHECK (is_project_owner(project_id));

CREATE POLICY "Owners can update project members"
  ON project_members FOR UPDATE
  USING (is_project_owner(project_id));

CREATE POLICY "Owners can delete project members"
  ON project_members FOR DELETE
  USING (is_project_owner(project_id));

-- Interviews: membership checked via function
CREATE POLICY "Members can view interviews"
  ON interviews FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Editors can create interviews"
  ON interviews FOR INSERT
  WITH CHECK (is_project_editor(project_id));

CREATE POLICY "Editors can update interviews"
  ON interviews FOR UPDATE
  USING (is_project_editor(project_id));

-- Interview Chunks: get project_id via helper, then check membership
CREATE POLICY "Members can view chunks"
  ON interview_chunks FOR SELECT
  USING (is_project_member(get_interview_project(interview_id)));

-- Entities: globally readable by any authenticated user
CREATE POLICY "Authenticated users can view entities"
  ON entities FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert entities"
  ON entities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update entities"
  ON entities FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Entity Mentions: check via interview's project
CREATE POLICY "Members can view entity mentions"
  ON entity_mentions FOR SELECT
  USING (is_project_member(get_interview_project(interview_id)));

CREATE POLICY "Authenticated users can insert entity mentions"
  ON entity_mentions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
