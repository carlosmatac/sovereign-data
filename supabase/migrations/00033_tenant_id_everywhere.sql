-- ============================================================
-- Phase 3a / PR 3a.2 — tenant_id on every customer-owned table
-- ============================================================
-- Adds tenant_id to all Tier A (NOT NULL) and Tier B (NULLABLE)
-- tables, backfills from the bootstrap tenant, asserts zero orphans,
-- hardens with compound UNIQUE + compound FKs for parent/child
-- tenant consistency, and adds hot-path indexes.
--
-- Run AFTER 00032 (tenants must exist).
-- App writes that set tenant_id must be deployed alongside this
-- migration — the compound FKs will reject inserts that omit it.
-- ============================================================

-- ── Step 1: resolve bootstrap tenant id ──────────────────────
-- We resolve it once and use it throughout via a DO block variable
-- so we never hardcode a UUID.
DO $$
DECLARE
  v_tid UUID;
  v_orphans INTEGER;
BEGIN

  SELECT id INTO v_tid FROM tenants ORDER BY created_at LIMIT 1;
  IF v_tid IS NULL THEN
    RAISE EXCEPTION '00033 requires the bootstrap tenant from 00032 — run 00032 first';
  END IF;

  -- ── Step 2: add tenant_id columns (nullable) ───────────────
  -- Tier A (will become NOT NULL after backfill)
  ALTER TABLE projects                  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE project_members           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE sources                   ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE source_chunks             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE source_entities           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE entity_mentions           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE entity_relationships      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE content_snippets          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE interview_review_entities ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE reports                   ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE chat_conversations        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE chat_messages             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE chat_conversation_seq     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

  -- Tier B (stays nullable — NULL = platform-global)
  ALTER TABLE entities                  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  ALTER TABLE entity_aliases            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

  -- ── Step 3: backfill Tier A rows ───────────────────────────

  -- projects → bootstrap tenant
  UPDATE projects SET tenant_id = v_tid WHERE tenant_id IS NULL;

  -- project_members → inherit from project
  UPDATE project_members pm
     SET tenant_id = p.tenant_id
    FROM projects p
   WHERE pm.project_id = p.id
     AND pm.tenant_id IS NULL;

  -- sources → inherit from project
  UPDATE sources s
     SET tenant_id = p.tenant_id
    FROM projects p
   WHERE s.project_id = p.id
     AND s.tenant_id IS NULL;

  -- source_chunks → inherit from source
  UPDATE source_chunks sc
     SET tenant_id = s.tenant_id
    FROM sources s
   WHERE sc.source_id = s.id
     AND sc.tenant_id IS NULL;

  -- source_entities → inherit from source
  UPDATE source_entities se
     SET tenant_id = s.tenant_id
    FROM sources s
   WHERE se.source_id = s.id
     AND se.tenant_id IS NULL;

  -- entity_mentions → inherit from source (column is still named interview_id for back-compat)
  UPDATE entity_mentions em
     SET tenant_id = s.tenant_id
    FROM sources s
   WHERE em.interview_id = s.id
     AND em.tenant_id IS NULL;

  -- entity_relationships → inherit from source
  UPDATE entity_relationships er
     SET tenant_id = s.tenant_id
    FROM sources s
   WHERE er.interview_id = s.id
     AND er.tenant_id IS NULL;

  -- content_snippets → inherit from source
  UPDATE content_snippets cs
     SET tenant_id = s.tenant_id
    FROM sources s
   WHERE cs.interview_id = s.id
     AND cs.tenant_id IS NULL;

  -- interview_review_entities → inherit from source
  UPDATE interview_review_entities ire
     SET tenant_id = s.tenant_id
    FROM sources s
   WHERE ire.interview_id = s.id
     AND ire.tenant_id IS NULL;

  -- reports → inherit from project
  UPDATE reports r
     SET tenant_id = p.tenant_id
    FROM projects p
   WHERE r.project_id = p.id
     AND r.tenant_id IS NULL;

  -- chat_conversations → from project if set, else from user's primary tenant
  UPDATE chat_conversations cc
     SET tenant_id = COALESCE(
           (SELECT p.tenant_id FROM projects p WHERE p.id = cc.project_id),
           (SELECT tm.tenant_id FROM tenant_members tm
             WHERE tm.user_id = cc.user_id
             ORDER BY tm.created_at LIMIT 1)
         )
   WHERE cc.tenant_id IS NULL;

  -- chat_messages → from conversation
  UPDATE chat_messages cm
     SET tenant_id = cc.tenant_id
    FROM chat_conversations cc
   WHERE cm.conversation_id = cc.id
     AND cm.tenant_id IS NULL;

  -- chat_conversation_seq → from conversation
  UPDATE chat_conversation_seq cs
     SET tenant_id = cc.tenant_id
    FROM chat_conversations cc
   WHERE cs.conversation_id = cc.id
     AND cs.tenant_id IS NULL;

  -- ── Step 4: backfill Tier B rows ───────────────────────────
  -- Entities with a project_id inherit the tenant from their project.
  -- Entities with project_id IS NULL (global) stay tenant_id = NULL — correct.
  UPDATE entities e
     SET tenant_id = p.tenant_id
    FROM projects p
   WHERE e.project_id = p.id
     AND e.tenant_id IS NULL;

  -- entity_aliases: inherit from the entity they belong to.
  -- Global entities (tenant_id NULL) → global aliases (tenant_id NULL).
  UPDATE entity_aliases a
     SET tenant_id = e.tenant_id
    FROM entities e
   WHERE a.entity_id = e.id
     AND a.tenant_id IS NULL
     AND e.tenant_id IS NOT NULL;

  -- ── Step 5: assert no Tier A orphans (abort on mismatch) ──
  SELECT COUNT(*) INTO v_orphans FROM projects               WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: projects orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM sources                WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: sources orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM source_chunks          WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: source_chunks orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM source_entities        WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: source_entities orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM entity_mentions        WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: entity_mentions orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM entity_relationships   WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: entity_relationships orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM content_snippets       WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: content_snippets orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM interview_review_entities WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: interview_review_entities orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM reports                WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: reports orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM chat_conversations     WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: chat_conversations orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM chat_messages          WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: chat_messages orphans=%', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM chat_conversation_seq  WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'tenant_id backfill incomplete: chat_conversation_seq orphans=%', v_orphans; END IF;

END $$;

-- ── Step 6: SET NOT NULL on Tier A ────────────────────────────
ALTER TABLE projects                  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE project_members           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE sources                   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE source_chunks             ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE source_entities           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE entity_mentions           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE entity_relationships      ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE content_snippets          ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE interview_review_entities ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE reports                   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE chat_conversations        ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE chat_messages             ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE chat_conversation_seq     ALTER COLUMN tenant_id SET NOT NULL;
-- Tier B stays nullable — NULL = global

-- ── Step 7: compound UNIQUE on Tier A parents ─────────────────
-- Enables compound FKs from children to reference (id, tenant_id) pairs.
ALTER TABLE projects           ADD CONSTRAINT projects_id_tenant_unique    UNIQUE (id, tenant_id);
ALTER TABLE sources            ADD CONSTRAINT sources_id_tenant_unique     UNIQUE (id, tenant_id);
ALTER TABLE chat_conversations ADD CONSTRAINT chat_conv_id_tenant_unique   UNIQUE (id, tenant_id);

-- ── Step 8: compound FKs — enforce parent/child consistency ──
-- A child row whose tenant_id disagrees with its parent will be
-- rejected at the DB level. No application-side guard can be more
-- reliable than this.

-- sources → projects
ALTER TABLE sources ADD CONSTRAINT sources_project_tenant_fkey
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id);

-- project_members → projects
ALTER TABLE project_members ADD CONSTRAINT project_members_project_tenant_fkey
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id);

-- reports → projects
ALTER TABLE reports ADD CONSTRAINT reports_project_tenant_fkey
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id);

-- source_chunks → sources
ALTER TABLE source_chunks ADD CONSTRAINT source_chunks_source_tenant_fkey
  FOREIGN KEY (source_id, tenant_id) REFERENCES sources(id, tenant_id)
  ON DELETE CASCADE;

-- source_entities → sources
ALTER TABLE source_entities ADD CONSTRAINT source_entities_source_tenant_fkey
  FOREIGN KEY (source_id, tenant_id) REFERENCES sources(id, tenant_id)
  ON DELETE CASCADE;

-- entity_mentions → sources (via interview_id back-compat column name)
ALTER TABLE entity_mentions ADD CONSTRAINT entity_mentions_source_tenant_fkey
  FOREIGN KEY (interview_id, tenant_id) REFERENCES sources(id, tenant_id)
  ON DELETE CASCADE;

-- entity_relationships → sources (via interview_id back-compat column name)
ALTER TABLE entity_relationships ADD CONSTRAINT entity_relationships_source_tenant_fkey
  FOREIGN KEY (interview_id, tenant_id) REFERENCES sources(id, tenant_id)
  ON DELETE CASCADE;

-- content_snippets → sources (via interview_id back-compat column name)
ALTER TABLE content_snippets ADD CONSTRAINT content_snippets_source_tenant_fkey
  FOREIGN KEY (interview_id, tenant_id) REFERENCES sources(id, tenant_id)
  ON DELETE CASCADE;

-- interview_review_entities → sources (via interview_id back-compat column name)
ALTER TABLE interview_review_entities ADD CONSTRAINT review_entities_source_tenant_fkey
  FOREIGN KEY (interview_id, tenant_id) REFERENCES sources(id, tenant_id)
  ON DELETE CASCADE;

-- chat_messages → chat_conversations
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_conversation_tenant_fkey
  FOREIGN KEY (conversation_id, tenant_id) REFERENCES chat_conversations(id, tenant_id)
  ON DELETE CASCADE;

-- chat_conversation_seq → chat_conversations
ALTER TABLE chat_conversation_seq ADD CONSTRAINT chat_conv_seq_conversation_tenant_fkey
  FOREIGN KEY (conversation_id, tenant_id) REFERENCES chat_conversations(id, tenant_id)
  ON DELETE CASCADE;

-- ── Step 9: Tier B parent/child consistency trigger ───────────
-- entity_mentions, entity_relationships, source_entities, entity_aliases
-- can reference entities whose tenant_id is NULL (global). We allow this
-- but prohibit a non-global child from referencing a global parent or a
-- parent from a different tenant.

-- Trigger function for tables with a single `entity_id` column
-- (entity_mentions, source_entities). Cannot reference NEW.source_entity_id
-- here because plpgsql parses field accesses eagerly.
CREATE OR REPLACE FUNCTION enforce_single_entity_tenant_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_entity_tenant
  FROM   entities
  WHERE  id = NEW.entity_id;

  -- If the entity is global (tenant_id NULL) the child can carry any tenant.
  -- If the entity has a specific tenant, the child must match it.
  IF v_entity_tenant IS NOT NULL
     AND NEW.tenant_id IS DISTINCT FROM v_entity_tenant
  THEN
    RAISE EXCEPTION
      'tenant_id mismatch: row.tenant_id=%, entity.tenant_id=%',
      NEW.tenant_id, v_entity_tenant;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function for entity_relationships (source_entity_id + target_entity_id).
-- Both endpoints must be consistent with the row's tenant_id.
CREATE OR REPLACE FUNCTION enforce_relationship_tenant_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_source_tenant UUID;
  v_target_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_source_tenant FROM entities WHERE id = NEW.source_entity_id;
  SELECT tenant_id INTO v_target_tenant FROM entities WHERE id = NEW.target_entity_id;

  IF v_source_tenant IS NOT NULL
     AND NEW.tenant_id IS DISTINCT FROM v_source_tenant
  THEN
    RAISE EXCEPTION
      'tenant_id mismatch on entity_relationships.source: row.tenant_id=%, source_entity.tenant_id=%',
      NEW.tenant_id, v_source_tenant;
  END IF;

  IF v_target_tenant IS NOT NULL
     AND NEW.tenant_id IS DISTINCT FROM v_target_tenant
  THEN
    RAISE EXCEPTION
      'tenant_id mismatch on entity_relationships.target: row.tenant_id=%, target_entity.tenant_id=%',
      NEW.tenant_id, v_target_tenant;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER entity_mentions_tenant_check
  BEFORE INSERT OR UPDATE ON entity_mentions
  FOR EACH ROW EXECUTE FUNCTION enforce_single_entity_tenant_consistency();

CREATE TRIGGER source_entities_tenant_check
  BEFORE INSERT OR UPDATE ON source_entities
  FOR EACH ROW EXECUTE FUNCTION enforce_single_entity_tenant_consistency();

CREATE TRIGGER entity_relationships_tenant_check
  BEFORE INSERT OR UPDATE ON entity_relationships
  FOR EACH ROW EXECUTE FUNCTION enforce_relationship_tenant_consistency();

-- entity_aliases references an entity via entity_id
CREATE OR REPLACE FUNCTION enforce_alias_tenant_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_entity_tenant
  FROM   entities
  WHERE  id = NEW.entity_id;

  IF v_entity_tenant IS NOT NULL
     AND NEW.tenant_id IS DISTINCT FROM v_entity_tenant
  THEN
    RAISE EXCEPTION
      'tenant_id mismatch on entity_aliases: alias.tenant_id=%, entity.tenant_id=%',
      NEW.tenant_id, v_entity_tenant;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER entity_aliases_tenant_check
  BEFORE INSERT OR UPDATE ON entity_aliases
  FOR EACH ROW EXECUTE FUNCTION enforce_alias_tenant_consistency();

-- ── Step 10: update Phase 2.5 unique index on entities ───────
-- Migrate from project-scoped to tenant-scoped uniqueness.
-- Two projects within the same tenant can still share entity rows
-- (cross-project intelligence within a tenant). Two different tenants
-- are now properly isolated.
DROP INDEX IF EXISTS entities_name_type_scope_unique;
CREATE UNIQUE INDEX entities_name_type_scope_unique
  ON entities (
    normalized_name,
    type,
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Migrate entity_aliases unique index similarly
DROP INDEX IF EXISTS entity_aliases_alias_scope_unique;
CREATE UNIQUE INDEX entity_aliases_alias_scope_unique
  ON entity_aliases (
    entity_id,
    alias_normalized,
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ── Step 11: hot-path indexes ─────────────────────────────────
-- tenant_id on its own for direct membership checks and
-- compound (tenant_id, parent_id) for the most common join patterns.

CREATE INDEX idx_projects_tenant_id           ON projects (tenant_id);
CREATE INDEX idx_sources_tenant_id            ON sources (tenant_id);
CREATE INDEX idx_sources_tenant_project       ON sources (tenant_id, project_id);
CREATE INDEX idx_source_chunks_tenant_id      ON source_chunks (tenant_id);
CREATE INDEX idx_source_chunks_tenant_source  ON source_chunks (tenant_id, source_id);
CREATE INDEX idx_source_entities_tenant_id    ON source_entities (tenant_id);
CREATE INDEX idx_entity_mentions_tenant_id    ON entity_mentions (tenant_id);
CREATE INDEX idx_entity_rels_tenant_id        ON entity_relationships (tenant_id);
CREATE INDEX idx_content_snippets_tenant_id   ON content_snippets (tenant_id);
CREATE INDEX idx_reports_tenant_id            ON reports (tenant_id);
CREATE INDEX idx_chat_conv_tenant_id          ON chat_conversations (tenant_id);
CREATE INDEX idx_chat_messages_tenant_id      ON chat_messages (tenant_id);
CREATE INDEX idx_entities_tenant_id           ON entities (tenant_id);
CREATE INDEX idx_entity_aliases_tenant_id     ON entity_aliases (tenant_id);
