-- ============================================
-- Platform user roles (member / platform_admin)
-- ============================================
-- Distinct from project_members.role (owner/editor/viewer).
-- Default: every user gets `member` on signup via handle_new_user.
-- ============================================

CREATE TYPE platform_role AS ENUM (
  'member',
  'platform_admin'
);

CREATE TABLE user_platform_roles (
  id         UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       platform_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX idx_user_platform_roles_user_id ON user_platform_roles(user_id);

ALTER TABLE user_platform_roles ENABLE ROW LEVEL SECURITY;

-- Users may read their own platform roles (for UI gating; server remains authoritative).
CREATE POLICY "Users can view own platform roles"
  ON user_platform_roles FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for authenticated clients — promotion via service role / SQL.

-- SECURITY DEFINER helper for future RLS or server checks (matches is_project_owner pattern).
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_platform_roles
    WHERE user_id = auth.uid()
      AND role = 'platform_admin'
  );
$$;

-- Assign default `member` on signup (same transaction as profile insert).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email));

  INSERT INTO public.user_platform_roles (user_id, role)
  VALUES (NEW.id, 'member');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill existing profiles with `member` where missing.
INSERT INTO user_platform_roles (user_id, role)
SELECT p.id, 'member'::platform_role
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1
  FROM user_platform_roles upr
  WHERE upr.user_id = p.id
    AND upr.role = 'member'::platform_role
);
