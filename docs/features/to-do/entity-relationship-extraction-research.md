# Entity Relationship Extraction — Architecture Research Report

> **Status**: investigation complete — pending product decisions before implementation.  
> **Date**: 2026-05-18  
> **Purpose**: Inform a rewrite of `entity-relationship-extraction.md` before any code is touched.

---

## 1. Current Schema Summary

### `entity_relationships` (graph edges)

| Column | Type | Notes |
|--------|------|-------|
| `source_entity_id` | UUID | FK → `entities` |
| `target_entity_id` | UUID | FK → `entities` |
| `relation_type` | `relation_type` enum | See taxonomy below |
| `confidence` | REAL | 0–1, LLM-assigned |
| `evidence_text` | TEXT | Quote from transcript |
| `interview_id` | UUID | Provenance — which source this came from |
| `review_status` | enum | `pending`, `approved`, `rejected` |
| `origin` | enum | `llm`, `human_created`, `human_edited` |

**Unique constraint**: `(source_entity_id, target_entity_id, relation_type, interview_id)`.  
Implication: the same entity pair **can** have multiple rows with different `relation_type` values, and the same type **can** appear across multiple sources (different `interview_id`). Multiple typed relationships are **already supported at the schema level**.

**Current `relation_type` enum** (migrations `00004` + `00024`):
```
v2 preferred:  supplier, competitor, investor, subsidiary, acquirer,
               critic, advisor, regulator, affiliated_with,
               operates_in, governs, customer_of
legacy:        business_partner, ally
```

### `source_entities` (source ↔ entity association layer)

Added in Phase 2.2 (migration `00028`). Each row describes how an entity is linked to a source, with:
- `link_type` enum: `interviewee`, `interviewee_org`, `interviewer`, `translator`, `participant`, `author`, `primary_subject`, `subject_organization`, `account`, `source_owner`, `mentioned_at_source_level`, `related_entity`
- `origin` enum: `upload_anchor`, `metadata_import`, `extraction`, `crm_import`, `manual_tag`, `ai_inference`, `human_review`, `alias_propagation`, `prior_context`
- `confidence`, `evidence`, `is_primary`

This table **already captures** which entities appeared in which source and with what role. It is the source-to-entity association layer.

### `entities` (graph nodes)

- Project-scoped (`project_id` NOT NULL) or global (`project_id` IS NULL)
- Unique constraint: `(normalized_name, type, COALESCE(project_id, sentinel_uuid))`
- Supports canonical merge via `canonical_entity_id`
- 13 types: `PERSON`, `COMPANY`, `GOVERNMENT`, `ORGANIZATION`, `LOCATION`, `EVENT`, `COUNTRY`, `SECTOR`, `COMMODITY`, `PUBLIC_INSTITUTION`, `STATE_OWNED_ENTERPRISE`, `LAW_OR_POLICY`, `MEDIA_OR_PUBLICATION`
- Phase 4b adds: `TOPIC`, `RISK`, `OPPORTUNITY`, `PROJECT` as extraction-only types

### `validated_positions` (person ↔ org role layer)

Global table — already purpose-built for "Person X was CEO of Company Y from date A to date B". Not populated by the pipeline today (populated via admin/SQL only), but architecturally this is the right home for fine-grained employment/role relationships with temporal precision.

---

## 2. Current Pipeline Flow: Entities, Relationships, and Source Associations

```
Upload (interviewee_name, interviewee_org, interviewee_title)
  ↓
assemblyai.ts → keyterms_prompt built from entity_aliases
  ↓
extraction.ts → extractIntelligence()
  - LLM extracts: entities[], relationships[], source_associations[]
  - Relationship taxonomy (14 types, see above)
  - Prompt includes: type guidance, direction guidance, negative examples
  - No guidance to distinguish CEO from employee — both → "affiliated_with"
  ↓
pipeline.ts → resolveExtractedEntities()
  - matchOrCreateEntity() for each entity: 5-tier matching
  - Builds entityIdMap (name → UUID)
  ↓
ground-mentions.ts → groundEntityMentions()
  - 4-tier hybrid: exact → alias → anchor_context → conservative fuzzy
  - Only exact/alias methods count as "persistable"
  ↓
persistence-gate.ts → applyPersistenceGate()
  *** THE MAIN BOTTLENECK ***
  - Entity survives only if it has ≥1 exact or alias grounded mention in chunks
  - Relationship survives only if BOTH endpoints survived
  - anchor_context and fuzzy matches DO NOT count for persistence
  ↓
DB upserts:
  - entity_mentions (chunk-level)
  - entity_relationships (graph edges)
  - source_entities (source-level, via backfill from anchors + extraction)
  ↓
[No anchor→relationship step exists]
```

**What the pipeline does NOT do** (the gaps):
1. Never creates `entity_relationships` rows from upload anchors — the `interviewee_name + interviewee_org + interviewee_title` fields are used for grounding context and chunk normalization but never produce a graph edge
2. The anchor entities do not get a special pass through the persistence gate — if ASR spells "Mohammed Al-Rashid" as "Mohammed Alrashid" and no alias exists, the person entity is dropped, taking all their relationships with them
3. No co-occurrence inference: if two entities both appear in `source_entities` for the same source but the LLM didn't extract a direct relationship between them, no connection exists in the graph

---

## 3. What Is Currently Missing or Broken

### 3a. The persistence gate vs. anchor entities
**This is the primary cause of zero-relationship sources.**

When a source has poor ASR quality and the interviewee's name is consistently misspelled, the anchor entity gets matched and resolved internally but does NOT earn an exact/alias grounded mention → it is dropped from the persisted graph → all its relationships are dropped with it.

The fix is NOT to loosen the gate globally (the gate exists to prevent noise). The fix is to grant `upload_anchor` origin entities in `source_entities` a special persistence path that bypasses the exact/alias requirement — we know they were there because a human told us.

### 3b. No anchor-driven relationship creation
The most obvious relationship in any interview — "Person X works for Organization Y" — is never automatically created. The user explicitly provides this via the upload form (`interviewee_name`, `interviewee_org`, `interviewee_title`), but the pipeline throws that signal away after using it for embedding enrichment.

### 3c. Taxonomy gap: person ↔ org types
`affiliated_with` is the only person↔org relationship type. It collapses CEO, board member, ministry official, founder, and intern into one indistinguishable type. The LLM cannot differentiate them even when the transcript is explicit. `validated_positions` exists precisely for this layer but is currently populated only via SQL/admin, not from the pipeline.

### 3d. The LLM extraction prompt is actually good
After reading `extraction.ts` in full: the prompt is well-structured with type guidance, direction rules, negative examples, and candidate entity context. The problem is not primarily the prompt — it is the persistence gate silently discarding relationships whose endpoints didn't ground to exact/alias matches.

### 3e. No co-occurrence relationship
Two entities that both appear in `source_entities` for the same source have no automatic edge between them. This is by design (noisy if generic), but there's no lightweight fallback for "we know they both participated in this source but the LLM didn't extract an explicit relationship".

---

## 4. Question-by-Question Investigation

### Q1: Should sources become graph nodes?

**Recommendation: No.**

Sources are already the association layer. `source_entities` captures every entity's role in each source. `entity_mentions` captures chunk-level textual evidence. The `entity_intel` RPC already surfaces this data with `"anchor"`, `"source_entity"`, `"mention"`, and `"related_via_relationship"` kinds.

Making sources graph nodes would:
- Bloat the Network Explorer with non-entity nodes
- Require every entity to have edges to all its sources (N sources × M entities = noise)
- Duplicate what `source_entities` already provides at the association layer

**The right fix is different**: when the LLM extracts two entities from the same source and they have a meaningful interaction, that should produce an `entity_relationships` row. The issue is the LLM is missing those relationships, and the persistence gate is dropping them. Fix the extraction and fix the gate — don't change the graph model.

**For co-occurrence without explicit interaction**: do not add a generic `CO_MENTIONED_IN` edge type. The signal is too weak and would flood the graph. Instead, surface co-occurrence in the Copilot context via `source_entities` joins (both entities appear in the same source) rather than as graph edges.

### Q2: Should projects become graph nodes?

**Recommendation: No.**

Projects are already the tenant root. Every entity in a project is already scoped via `entities.project_id`. The `entity_intel` RPC can optionally filter by `p_project_id`. Adding a project node would create a star topology: every entity in the project connected to the same central node, which drowns out real relationships.

The right question is: "can we traverse from a project to all its entities?" Yes — by filtering `entities WHERE project_id = ?`. This is a filter query, not a graph traversal, and it is already trivially supported.

**If a visual project node is needed for the Network Explorer UI**: it can be a pseudo-node added client-side as a UX affordance, not a real row in `entities`. It should not be persisted to the database.

### Q3: What deterministic relationships should anchor uploads produce?

When a user uploads with `interviewee_name` + `interviewee_org`:

| Anchor pattern | Deterministic relationship | Direction | Confidence |
|---|---|---|---|
| PERSON + any org type | `affiliated_with` (fallback if no title) | PERSON → ORG | 1.0 |
| PERSON + org + title in taxonomy | specific type from title map (see §6) | PERSON → ORG | 1.0 |

For the upload form: rather than free-text `interviewee_title`, offer a **predefined relationship type dropdown** alongside a free-text field for the exact title string. The dropdown drives the `relation_type` written to `entity_relationships`; the free-text title is stored as `evidence_text`.

**Proposed dropdown options** (maps to relation_type + description in evidence_text):
```
Leads / CEO / Director / Minister → "leads" (new type)
Works for / Employee / Staff       → "affiliated_with"
Founder / Co-founder               → "founded" (new type)
Board member / Board director      → "member_of" (new type)
Advisor / Consultant               → "advisor"
Represents / Spokesperson          → "represents" (new type)
Regulator / Oversees               → "governs"
Owner / Proprietor                 → "affiliated_with" (with title in evidence)
```

This makes the relationship immediately useful without requiring the LLM.

### Q4: Multiple relationships between the same entity pair

**Already supported at schema level.** The unique constraint `(source_entity_id, target_entity_id, relation_type, interview_id)` allows the same pair to have:
- Multiple rows with different `relation_type` values ✓
- Multiple rows with the same type but from different sources ✓

**Example** (Person → Company, same person different sources):
```
Row 1: Person → Company | affiliated_with | confidence 0.9 | interview_A
Row 2: Person → Company | affiliated_with | confidence 0.85 | interview_B
Row 3: Person → Company | leads          | confidence 1.0  | anchor_origin
```

All three rows are valid and distinct. The Network Explorer currently merges them into a single edge (it just queries `entity_relationships` and doesn't group by type), but the data model is already correct.

**No schema change needed for this.** What IS needed: the taxonomy expansion so distinct relationship types (leads, founded, member_of) can be used instead of all collapsing to `affiliated_with`.

**Directionality enforcement**: the schema allows `(A→B, type1)` and `(B→A, type1)` as separate rows (no directionality constraint). The LLM is already instructed to use canonical direction (e.g. "supplier" = seller → buyer). For anchor relationships, direction should be hardcoded: PERSON → ORG for employment/role types.

### Q5: LLM extraction quality

**Where relationships are extracted**: `src/lib/ai/extraction.ts`, function `extractIntelligence()`, in the `relationships` array of `ExtractionSchema`.

**Current prompt quality**: 
- Good: taxonomy with type guidance, direction rules, preference ordering (`affiliated_with` for person↔org, `operates_in` for org↔country, etc.)
- Good: confidence field, evidence_text field
- Good: candidate entities context to help match known project entities
- Good: negative examples ("do NOT use business_partner for a person-to-organisation tie")
- Gap: no instruction to extract ALL person↔org connections that are explicit in the transcript (the instruction is type-guidance focused, not completeness focused)
- Gap: no quantity signal — the model may underextract relationships if the prompt doesn't signal that missing obvious connections is costly

**Current relationship types** passed to the LLM Zod enum: the 14 types above.

**Validation**: none beyond Zod type checking. No minimum-relationship requirement, no post-extraction validation pass.

**Deduplication**: handled by the DB upsert unique constraint. No pre-persistence dedup in code.

**Confidence**: LLM-assigned float 0–1. No threshold filtering before persistence (any confidence survives if both endpoints pass the gate).

**Evidence grounding**: `evidence_text` is nullable. The LLM often returns `null` for inferred relationships. No enforcement of non-null evidence.

**Why sources produce zero relationships** — two root causes:
1. Persistence gate drops entities with only anchor_context/fuzzy grounding → their relationships disappear
2. The interviewee themselves (the most-mentioned person in any interview) may fail the gate if their name is consistently misspelled in the ASR output and no alias exists yet

---

## 5. Recommended Relationship Model

### A. Sources remain association records (not graph nodes)
No change to the `source_entities` model. Improve how source-entity co-occurrence surfaces in Copilot (via context injection) rather than as graph edges.

### B. Projects remain tenant roots (not graph nodes)
No change. Filter by `project_id` for project-scoped entity lists.

### C. Anchor entities get a persistence gate bypass
Entities with `source_entities.origin = 'upload_anchor'` for a given source should be treated as "definitely present" and persisted to `entity_mentions` and `entity_relationships` regardless of their exact/alias grounding score.

This is a targeted gate relaxation, not a global one. The strict gate applies to all LLM-extracted entities.

Implementation: after the persistence gate runs, check `source_entities` for the current source's `upload_anchor` origin rows and promote their entity IDs into `persistedEntityIds` — then re-evaluate any dropped relationships whose endpoints include those anchors.

### D. Anchor-driven relationship creation
After entity resolution (when `interviewee_entity_id` and `interviewee_org_entity_id` are both known), create an `entity_relationships` row:
- `source_entity_id`: person entity ID
- `target_entity_id`: org entity ID
- `relation_type`: from the upload form's relationship dropdown (or `affiliated_with` fallback)
- `confidence`: 1.0
- `evidence_text`: `interviewee_title` if set, else null
- `interview_id`: the source ID
- `origin`: `anchor_derived` (new enum value to add)
- `review_status`: `approved` (human-asserted, no review needed)

This creation happens unconditionally — it does NOT go through the persistence gate.

### E. Taxonomy expansion (targeted)
Add the most important missing types to `relation_type` enum:
- `leads` — person is CEO, minister, director, head of (PERSON → ORG)
- `founded` — person or entity founded/created another (PERSON → ORG, or ORG → ORG for spinoffs)
- `member_of` — board member, committee member, part of a coalition (PERSON/ORG → ORG)
- `represents` — spokesperson, official representative, ambassador (PERSON → ORG/COUNTRY)

These four types cover the most common person↔org relationship classes that transcripts make explicit but `affiliated_with` cannot distinguish.

Keep `affiliated_with` as the fallback for generic/ambiguous person↔org associations.

**`validated_positions` integration (Phase 2)**: when the LLM or anchor produces a `leads` or `affiliated_with` relationship with title evidence, write a `validated_positions` row (state: `pending_review`) for human validation. This bridges the graph edge (who-knows-whom) with the temporal employment record (who-had-what-role-when).

### F. LLM prompt improvements (targeted)
Three additions to the existing prompt:

1. **Completeness instruction**: "For every PERSON-ORG pair that appears together in this transcript, you MUST attempt to extract a relationship. Missing an obvious person↔org connection is a critical error. If the evidence is thin, use `affiliated_with` with low confidence rather than omitting the relationship."

2. **Evidence enforcement**: "evidence_text must not be null for any relationship with confidence ≥ 0.7. Provide a direct quote or paraphrase. For low-confidence inferred relationships, null is acceptable."

3. **New types in the enum**: add `leads`, `founded`, `member_of`, `represents` to the Zod schema and prompt guidance.

---

## 6. Schema Changes Required

### Migration A: `relationship_origin` enum — add `anchor_derived`
```sql
ALTER TYPE relationship_origin ADD VALUE 'anchor_derived';
```
Needed before any anchor-driven relationship creation can be written.

### Migration B: `relation_type` enum — add four new types
```sql
ALTER TYPE relation_type ADD VALUE 'leads';
ALTER TYPE relation_type ADD VALUE 'founded';
ALTER TYPE relation_type ADD VALUE 'member_of';
ALTER TYPE relation_type ADD VALUE 'represents';
```
PostgreSQL enum additions are non-destructive and do not require a table rewrite.

### Migration C: Upload form — relationship type field (optional, Phase 2)
Add `interviewee_relationship_type relation_type` (nullable) to `sources` table. Allows the upload form to capture the specific relationship type the user intends, rather than always defaulting to `affiliated_with`.

### No change needed:
- `entity_relationships` table structure ✓ (unique constraint already supports multiple types per pair)
- `source_entities` table structure ✓ (already has the right association model)
- `entities` table structure ✓ (no project-as-entity needed)

---

## 7. Product Tradeoffs

### Tradeoff 1: Anchor gate bypass vs. graph purity
**For**: Anchors are human-asserted; it is clearly wrong to drop the main interviewee from the graph because ASR misspelled their name.  
**Against**: If anchor resolution matched the wrong entity (e.g., a common name), forcing that entity into the graph adds noise.  
**Resolution**: Scope the bypass to `upload_anchor` origin only (human-tagged during upload, not inferred). Keep the gate strict for LLM-extracted entities. Add a flag to `entity_relationships` rows created this way (`origin = 'anchor_derived'`) so they can be audited.

### Tradeoff 2: Taxonomy expansion vs. backward compatibility
**For**: `leads`, `founded`, `member_of`, `represents` cover the most obvious gaps and are backward-compatible (PostgreSQL enum additions are non-destructive).  
**Against**: More types = more cognitive load for future LLM prompt maintenance; the model may make wrong type selections.  
**Resolution**: Add only the 4 types with clear, non-overlapping definitions. Update the Zod schema and prompt in the same PR. The existing `affiliated_with` remains as the fallback for ambiguous cases, so the model is not forced to choose between confusingly similar types.

### Tradeoff 3: `validated_positions` auto-population vs. data quality
**For**: The pipeline already knows "Raji Bashir, CEO of NNPC" from the upload form — writing a `validated_positions` row (pending_review) would make this actionable in Copilot.  
**Against**: Auto-populated positions need human review before being treated as authoritative; introduces a review queue burden.  
**Resolution**: Phase 2 only. Auto-populate with `state = 'pending_review'`. The Copilot already degrades gracefully for positions that aren't validated. Don't block Phase 1 on this.

### Tradeoff 4: Sources as nodes — rejected
Making sources graph nodes would require a significant graph model change: new node type in the Network Explorer, new edge types (APPEARED_IN), RLS scope changes. The `source_entities` table already provides this context; surfacing it better in Copilot (context injection layer) is higher value for lower cost.

---

## 8. Final Recommendation

**Implement in this order:**

### Phase 1 — Fix the silence (quick wins, no new schema)
1. Anchor gate bypass: entities in `source_entities` with `origin = 'upload_anchor'` survive the persistence gate regardless of textual grounding
2. Add `anchor_derived` to `relationship_origin` enum (Migration A)
3. Anchor-driven relationship creation: after entity resolution, write one `entity_relationships` row from `interviewee_entity_id → interviewee_org_entity_id` with `relation_type = 'affiliated_with'`, `confidence = 1.0`, `origin = 'anchor_derived'`, `review_status = 'approved'`
4. LLM prompt: add completeness instruction and evidence enforcement

### Phase 2 — Taxonomy expansion
1. Add `leads`, `founded`, `member_of`, `represents` to `relation_type` enum (Migration B)
2. Update `ExtractionSchema` Zod enum in `extraction.ts` to include the four new types
3. Update extraction prompt with guidance for new types
4. Optionally add `interviewee_relationship_type` to `sources` table (Migration C) for the upload form dropdown

### Phase 3 — `validated_positions` pipeline integration
1. When anchor-driven relationships have `leads` or `affiliated_with` + a title, auto-create a `validated_positions` row with `state = 'pending_review'`
2. Add admin UI / review queue for pending positions

### Not recommended
- Source as graph node
- Project as graph node
- Generic `CO_MENTIONED_IN` edge type
- Global persistence gate relaxation

---

## 9. Files to Touch (Phase 1)

| File | Change |
|------|--------|
| `supabase/migrations/000XX_relationship_origin_anchor_derived.sql` | Add `anchor_derived` to enum |
| `src/lib/ai/persistence-gate.ts` | Add anchor bypass logic |
| `src/lib/ai/pipeline.ts` | Add anchor-driven relationship creation after entity resolution |
| `src/lib/ai/extraction.ts` | Add completeness instruction + evidence enforcement to prompt |
| `src/types/database.ts` | Add `anchor_derived` to `RelationshipOrigin` type |

**Phase 2 additions:**
| File | Change |
|------|--------|
| `supabase/migrations/000YY_relation_type_expansion.sql` | Add 4 new types |
| `src/lib/ai/extraction.ts` | Add new types to Zod enum + prompt |
| `src/types/database.ts` | Add new types to `RelationType` union |
| Upload form | Relationship type dropdown (optional) |
