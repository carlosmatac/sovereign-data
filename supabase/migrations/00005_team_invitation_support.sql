-- ============================================
-- Team Invitation Support
-- ============================================
-- Adds invited_email column to project_members so owners
-- can invite users who haven't signed up yet. A trigger
-- auto-claims pending invites when the invitee's profile
-- is created.
-- ============================================

-- 1. Allow pending invites (user_id NULL, invited_email set)
ALTER TABLE project_members
  ADD COLUMN invited_email TEXT,
  ALTER COLUMN user_id DROP NOT NULL;

-- At least one of user_id or invited_email must be present
ALTER TABLE project_members
  ADD CONSTRAINT check_member_or_invite
  CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL);

-- Only one pending invite per email per project
CREATE UNIQUE INDEX idx_unique_pending_invite
  ON project_members(project_id, invited_email)
  WHERE user_id IS NULL;

-- 2. Auto-claim pending invites when a new profile is created.
--    Wrapped in EXCEPTION block so a failure here never blocks user creation.
CREATE OR REPLACE FUNCTION claim_pending_invites()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email TEXT;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = NEW.id;

  IF _email IS NOT NULL THEN
    UPDATE project_members
    SET user_id = NEW.id, invited_email = NULL
    WHERE invited_email = _email
      AND user_id IS NULL;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'claim_pending_invites failed for profile %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_claim_invites ON profiles;

CREATE TRIGGER on_profile_created_claim_invites
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION claim_pending_invites();
