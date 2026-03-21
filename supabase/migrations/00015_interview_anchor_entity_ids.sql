-- Optional FK anchors when upload autocomplete selects an existing entity.
-- Pipeline prefers these IDs for primary_person_entity_id / primary_org_entity_id in chunk metadata.

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS interviewee_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interviewee_org_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_interviews_interviewee_entity_id
  ON interviews(interviewee_entity_id)
  WHERE interviewee_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interviews_interviewee_org_entity_id
  ON interviews(interviewee_org_entity_id)
  WHERE interviewee_org_entity_id IS NOT NULL;

COMMENT ON COLUMN interviews.interviewee_entity_id IS
  'Optional PERSON entity chosen at upload; pipeline uses for primary person anchor IDs.';
COMMENT ON COLUMN interviews.interviewee_org_entity_id IS
  'Optional COMPANY/ORGANIZATION/GOVERNMENT entity at upload; pipeline uses for primary org anchor IDs.';
