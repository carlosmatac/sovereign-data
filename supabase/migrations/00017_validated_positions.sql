-- Validated global positions (person ↔ organization roles). Not project-scoped.
-- Chat reads via service role; authenticated users may SELECT for future UI.

CREATE TYPE position_state AS ENUM (
  'active',
  'ended',
  'pending_review',
  'uncertain'
);

CREATE TYPE date_precision AS ENUM (
  'exact',
  'approximate',
  'unknown'
);

CREATE TABLE validated_positions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  organization_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  is_main BOOLEAN NOT NULL DEFAULT false,
  state position_state NOT NULL DEFAULT 'active',
  valid_from_date DATE,
  valid_from_precision date_precision NOT NULL DEFAULT 'unknown',
  valid_to_date DATE,
  valid_to_precision date_precision NOT NULL DEFAULT 'unknown',
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT validated_positions_main_requires_active CHECK (
    NOT is_main OR state = 'active'
  )
);

CREATE INDEX idx_validated_positions_person_state
  ON validated_positions(person_entity_id, state);

CREATE INDEX idx_validated_positions_org_state
  ON validated_positions(organization_entity_id, state)
  WHERE organization_entity_id IS NOT NULL;

CREATE INDEX idx_validated_positions_person_active_main
  ON validated_positions(person_entity_id)
  WHERE state = 'active' AND is_main = true;

CREATE TRIGGER update_validated_positions_updated_at
  BEFORE UPDATE ON validated_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE validated_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view validated_positions"
  ON validated_positions FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE validated_positions IS
  'Human-validated person–organization titles; global. Chat treats rows as authoritative vs transcript mentions.';

CREATE OR REPLACE FUNCTION public.list_distinct_position_titles(p_limit integer DEFAULT 200)
RETURNS TABLE(title text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT vp.title
  FROM validated_positions vp
  WHERE vp.title IS NOT NULL AND btrim(vp.title) <> ''
  GROUP BY vp.title
  ORDER BY vp.title
  LIMIT COALESCE(p_limit, 200);
$$;

GRANT EXECUTE ON FUNCTION public.list_distinct_position_titles(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_distinct_position_titles(integer) TO service_role;
