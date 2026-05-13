-- Migration 00044: Fix add_project_owner trigger to include tenant_id
--
-- Root cause: migration 00033 added tenant_id NOT NULL to project_members,
-- but the trigger function add_project_owner() (from 00001) was never updated
-- and still only inserts (project_id, user_id, role), leaving tenant_id NULL.
--
-- Fix: replace the trigger function to propagate NEW.tenant_id from the
-- projects row (which is always populated before the trigger fires).

CREATE OR REPLACE FUNCTION add_project_owner() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_members (project_id, user_id, role, tenant_id)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.tenant_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
