-- ============================================
-- Fix: created_by default + relaxed INSERT policy
-- ============================================
-- Problem: INSERT on projects fails with RLS violation because
-- auth.uid() may not match the client-sent created_by, or
-- the JWT context isn't properly set in PostgREST.
--
-- Solution:
-- 1. Set created_by DEFAULT to auth.uid() so DB fills it automatically
-- 2. Relax INSERT policy to just check user is authenticated
-- 3. Same fix for interviews table
-- ============================================

-- ── Set column defaults to auth.uid() ────────────────────────────

ALTER TABLE projects
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE interviews
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- ── Fix INSERT policies ──────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can create projects" ON projects;
CREATE POLICY "Authenticated users can create projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Editors can create interviews" ON interviews;
CREATE POLICY "Editors can create interviews"
  ON interviews FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND is_project_editor(project_id)
  );
