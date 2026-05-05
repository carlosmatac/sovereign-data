-- audit §12.2 — Anchor-only orgs
SELECT i.id, i.title, i.interviewee_org_entity_id, e.name
FROM interviews i
LEFT JOIN entities e ON e.id = i.interviewee_org_entity_id
LEFT JOIN entity_mentions em
       ON em.interview_id = i.id
      AND em.entity_id = i.interviewee_org_entity_id
WHERE i.interviewee_org_entity_id IS NOT NULL
  AND i.status = 'COMPLETED'
  AND em.id IS NULL;
