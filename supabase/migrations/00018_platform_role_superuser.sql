-- ============================================
-- platform_role: add superuser; split responsibilities
-- ============================================
-- member          = normal user
-- platform_admin  = entity / knowledge governance only (no user-role management)
-- superuser       = global role management + all platform_admin capabilities
-- ============================================

-- Add enum value (idempotent)
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'platform_role'
      AND e.enumlabel = 'superuser'
  ) THEN
    ALTER TYPE platform_role ADD VALUE 'superuser';
  END IF;
END
$migration$;

-- Existing platform_admin rows implied full admin (including user management).
-- Migrate to superuser so behavior stays equivalent after the split.
INSERT INTO user_platform_roles (user_id, role)
SELECT user_id, 'superuser'::platform_role
FROM user_platform_roles
WHERE role = 'platform_admin'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM user_platform_roles
WHERE role = 'platform_admin';

-- Replace helpers: drop old name, add split checks
DROP FUNCTION IF EXISTS public.is_platform_admin();

CREATE OR REPLACE FUNCTION public.is_superuser()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_platform_roles
    WHERE user_id = auth.uid()
      AND role = 'superuser'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_entity_governance_access()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_platform_roles
    WHERE user_id = auth.uid()
      AND role IN ('platform_admin', 'superuser')
  );
$$;
