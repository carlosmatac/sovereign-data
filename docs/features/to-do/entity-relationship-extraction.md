---
title: "Entity Relationship Extraction — Knowledge Graph Quality"
status: to-do
owner: team
priority: high
last_updated: 2026-05-18
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
migrations:
  - supabase/migrations/00045_relationship_taxonomy_v3.sql
  - supabase/migrations/00046_entity_type_expansion_v2.sql
  - supabase/migrations/00047_source_relationship_type_column.sql
  - supabase/migrations/00048_relationship_types_array_and_represents.sql
---

# Entity Relationship Extraction — Knowledge Graph Quality

> **Research companion**: [`entity-relationship-extraction-research.md`](./entity-relationship-extraction-research.md)  
> Full architecture audit, root-cause analysis, and tradeoff discussion. Read before implementing.

---

## Problem

Entity relationships are extracted unreliably. Sources with rich interpersonal content produce zero rows in `entity_relationships`. The Network Explorer graph is sparse. Copilot answers lack relationship context. The company's core value proposition — turning interviews into a connected knowledge graph — is undermined by these failures.

**Root causes (from investigation):**

1. **Persistence gate silences anchor entities.** The gate requires exact or alias textual grounding for every entity before it can be persisted. Upload anchors (the interviewee and their organisation, tagged by a human at upload time) get no special pass. If ASR misspelled a name and no alias exists yet, both entities and all their relationships are silently dropped. This is the single largest cause of zero-relationship sources.

2. **No anchor-driven relationship creation.** When a user uploads "Person X, CEO of Org Y", the pipeline uses those anchors for embedding context and resolution — but never writes an `entity_relationships` row from this explicit human-asserted signal. The most reliable relationship data in any interview is discarded at the graph layer.

3. **Taxonomy too coarse to be useful.** `affiliated_with` is the only person↔org type. CEO, board member, founder, and ministry official are indistinguishable. The LLM cannot produce specific types that don't exist in the enum.

4. **LLM extraction lacks completeness and evidence discipline.** The model is not told that missing obvious relationships is a critical error. High-confidence relationships frequently have null evidence text.

5. **No validation pass.** Relationships with unknown types, missing evidence, or referencing non-persisted entities are silently dropped rather than flagged, making diagnosis hard.

---

## Goals

- Every source with a tagged interviewee + organisation produces at least one `entity_relationships` row unconditionally — no LLM required.
- Upload anchor entities are never silently dropped from the graph.
- Multiple distinct typed relationships between the same entity pair are fully supported and preserved (already true at schema level; must not be broken).
- The canonical relationship taxonomy covers all common Sovereign use cases with clear direction, entity type constraints, and examples. 37 new types added in migration `00045`; deprecated types marked and blocked from new writes.
- The entity type taxonomy is aligned with a canonical target set (16 types) and the migration path to get there is defined.
- Two distinct graph layers are supported: **semantic relationships** (typed, directional, evidence-backed, stored in `entity_relationships`) and **contextual source/project associations** (co-occurrence and membership context from `source_entities`, surfaced in UI and Copilot without being stored as semantic edges).
- Re-ingesting the same source never produces duplicate relationship rows.
- Relationships with unknown types or missing required evidence are rejected before persistence.

---

## Non-Goals

- Manual UI for creating relationships → separate spec: `user-created-entities-relationships.md`.
- Source or project as persisted entity nodes in `entities` → explicitly rejected (see research doc §4).
- Generic `co_mentioned_in` semantic edge type → rejected (noisy, already covered by `source_entities` association layer).
- Full relationship governance UI (review queue, edit history) → Phase 5.
- Global deduplication across tenants or projects.
- `validated_positions` auto-population → Phase 5.
- Network Explorer visual redesign → separate task.

---

## Two-Layer Graph Model

This spec formalises the distinction between two types of entity connectivity that must NOT be conflated.

### Layer 1 — Semantic Relationships (`entity_relationships`)

Strong, typed, directional claims about how two entities are connected. These are:
- Stored as rows in `entity_relationships` with `relation_type`, `confidence`, `evidence_text`, `origin`, `review_status`
- Extracted by the LLM, created deterministically from upload anchors, or created manually by users
- Displayed as primary edges in the Network Explorer
- Used by the Copilot `lookupRelationships` tool

**Only use this layer for explicit, evidence-backed claims.** A person being mentioned in the same transcript as a company is NOT sufficient to create a semantic relationship row.

### Layer 2 — Contextual Associations (`source_entities`, future `project_entities`)

Soft, context-providing links between entities and sources or projects. These are:
- Stored in `source_entities` (which entity appeared in which source, with what role)
- NOT displayed as primary graph edges
- Used by the Copilot context builder to inject co-occurrence context: "Person X and Company Y both appear in source Z"
- Displayed in the Network Explorer as a visually distinct secondary layer (dashed edges, different colour) when enabled

**Rule**: Do not escalate a contextual association into a semantic relationship just to make the graph look more connected. Fix extraction instead.

---

## Canonical Relationship Taxonomy

Implemented in migration `00045`. All new extraction, anchor-driven relationships, and manual creation must use types from the active set. The TypeScript source of truth is `ACTIVE_RELATION_TYPE_VALUES` in `src/types/database.ts`.

### Active types — new in v3 (migration `00045`)

| `relation_type` | Direction | Source type(s) | Target type(s) | Example |
|---|---|---|---|---|
| **Employment / role** | | | | |
| `works_at` | PERSON → org | `PERSON` | org types | "She is a senior economist at the World Bank" |
| `leads` | PERSON → org | `PERSON` | org types | "Minister of Energy", "Chairperson of NNPC Board" |
| `is_ceo_of` | PERSON → org | `PERSON` | org types | "Raji Bashir, CEO of NNPC" |
| `is_cfo_of` | PERSON → org | `PERSON` | org types | "CFO of Standard Bank" |
| `is_cto_of` | PERSON → org | `PERSON` | org types | "CTO at Flutterwave" |
| `is_coo_of` | PERSON → org | `PERSON` | org types | "COO of the national oil company" |
| `is_cmo_of` | PERSON → org | `PERSON` | org types | "CMO at MTN Nigeria" |
| `is_cso_of` | PERSON → org | `PERSON` | org types | "Chief Strategy Officer at Equity Bank" |
| `is_board_member_of` | PERSON → org | `PERSON` | org types | "Board director at Société Générale" |
| `is_member_of` | person or org → org | `PERSON`, `COMPANY`, `ORGANIZATION` | org types | "Member of OPEC", "Nigeria is a member of ECOWAS" |
| `founded` | PERSON or org → org | `PERSON`, `COMPANY` | org types | "She founded AgroTech in 2015" |
| **Ownership / control** | | | | |
| `is_direct_parent_of` | org → org | org types | org types | "TotalEnergies is the direct parent of Total Nigeria" |
| `is_ultimate_parent_of` | org → org | org types | org types | "TotalEnergies SE is the ultimate parent of the group" |
| `invested_in` | person or org → org | `PERSON`, org types | org types | "The fund invested in three Kenyan startups" |
| `is_beneficial_owner_of` | PERSON → org | `PERSON` | `COMPANY`, `ORGANIZATION` | "He is the beneficial owner of the holding company" |
| `is_controlled_person_of` | PERSON → org | `PERSON` | `COMPANY`, `ORGANIZATION` | "She acts under direction of the controlling shareholder" |
| **Geography** | | | | |
| `has_headquarters_in` | org → location | org types | `COUNTRY`, `COUNTRY_REGION`, `FACILITY` | "Headquartered in Lagos" |
| `has_presence_in` | org → location | org types | `COUNTRY`, `COUNTRY_REGION` | "Operates in 12 African markets" |
| `is_registered_in` | org → country | org types | `COUNTRY` | "Registered under English law" |
| `located_in` | any → location | any | `COUNTRY`, `COUNTRY_REGION`, `FACILITY` | "The refinery is located in Port Harcourt" |
| `within` | location → location | `COUNTRY_REGION`, `FACILITY` | `COUNTRY`, `COUNTRY_REGION` | "Lagos State is within Nigeria" |
| `has_nationality` | PERSON → country | `PERSON` | `COUNTRY` | "Colombian national" |
| `native_to` | person or language → location | `PERSON`, `LANGUAGE` | `COUNTRY`, `COUNTRY_REGION` | "Hausa, native to Northern Nigeria" |
| **Governance** | | | | |
| `has_jurisdiction` | gov → entity | `GOVERNMENT`, `PUBLIC_INSTITUTION` | org types, `COUNTRY` | "The SEC regulates listed companies" |
| `operates_in_industry` | org → industry | org types | `SECTOR`, `INDUSTRY` | "Active in the LNG sector" |
| **Events / activities** | | | | |
| `spoke_at` | PERSON → event | `PERSON` | `EVENT`, `CORPORATE_EVENT` | "She keynoted the Africa Energy Forum" |
| `participates_in_corporate_event` | org or PERSON → event | org types, `PERSON` | `CORPORATE_EVENT` | "Equity Bank participated in the rights issue" |
| `studied_at` | PERSON → institution | `PERSON` | `EDUCATIONAL_INSTITUTION`, `ORGANIZATION` | "Studied at LSE" |
| `featured_in` | person or org → work/event | `PERSON`, `COMPANY` | `WORK_OF_ART`, `EVENT` | "Featured in the FT cover story" |
| **Markets / finance** | | | | |
| `listed_on` | COMPANY → exchange | `COMPANY` | `EXCHANGE` | "Listed on the Johannesburg Stock Exchange" |
| `traded_on` | commodity → exchange | `COMMODITY`, `PRODUCT` | `EXCHANGE` | "Crude oil traded on NYMEX" |
| **Products / works / infrastructure** | | | | |
| `manufactured_by` | product → org | `PRODUCT`, `COMMODITY` | org types | "Produced by DRC Copper Mining Co." |
| `published_by` | work → org | `WORK_OF_ART`, `LAW_OR_POLICY` | org types, `GOVERNMENT` | "Published by the Central Bank" |
| `created_by` | work → person or org | `WORK_OF_ART`, `PRODUCT` | `PERSON`, org types | "Authored by the Minister" |
| `designed_by` | product → person or org | `PRODUCT` | `PERSON`, org types | "Designed by the Angolan ANPG" |
| `operated_by` | facility → org | `FACILITY` | org types | "The Trans-Saharan pipeline is operated by Sonatrach" |
| `spoken_in` | LANGUAGE → location | `LANGUAGE` | `COUNTRY`, `COUNTRY_REGION` | "French spoken in DRC" |

> **`leads` vs `is_ceo_of`**: Use `is_ceo_of` when the transcript explicitly names the person as CEO or MD. Use `leads` for government ministers, chairpersons, heads of institution, or any named leader where "CEO" is semantically wrong. This resolves the minister-type ambiguity.

### Active types — retained from v2 (migration `00024`)

| `relation_type` | Direction | Notes |
|---|---|---|
| `affiliated_with` | PERSON → org | Generic fallback only. Always prefer a specific type. |
| `supplier` | seller → buyer | Supply chain context |
| `competitor` | bidirectional | Competitive intelligence |
| `acquirer` | acquirer → target | M&A context |
| `critic` | entity → entity | Political/editorial intelligence |
| `advisor` | advisor → advisee | Person/org advising another |
| `customer_of` | buyer → seller | Pair with `supplier` |

### Deprecated types — valid for existing rows, blocked for new writes

| `relation_type` | Superseded by | Notes |
|---|---|---|
| `investor` | `invested_in` | Direction was ambiguous; `invested_in` is explicit |
| `subsidiary` | `is_direct_parent_of` | Direction inverted: `is_direct_parent_of(parent, child)` |
| `regulator` | `has_jurisdiction` | `has_jurisdiction` is more precise |
| `operates_in` | `has_presence_in` or `operates_in_industry` | Was ambiguous between location and sector |
| `governs` | `has_jurisdiction` | Synonym; consolidated |

### Legacy types — do not emit

| `relation_type` | Notes |
|---|---|
| `business_partner` | Too vague. Use `supplier`, `customer_of`, or `affiliated_with`. |
| `ally` | Too vague. Use `affiliated_with` or a specific type. |

### Anchor-to-type mapping (upload form dropdown → deterministic relationship)

| Upload form label | `relation_type` written | Direction |
|---|---|---|
| CEO / Managing Director / President | `is_ceo_of` | PERSON → ORG |
| CFO / Finance Director | `is_cfo_of` | PERSON → ORG |
| CTO / Technology Director | `is_cto_of` | PERSON → ORG |
| COO / Operations Director | `is_coo_of` | PERSON → ORG |
| CMO / Marketing Director | `is_cmo_of` | PERSON → ORG |
| CSO / Strategy Director | `is_cso_of` | PERSON → ORG |
| Board member / Non-executive director | `is_board_member_of` | PERSON → ORG |
| Minister / Secretary of State / Head of institution | `leads` | PERSON → ORG |
| Employee / Staff / Official | `works_at` | PERSON → ORG |
| Founder / Co-founder | `founded` | PERSON → ORG |
| Member / Delegate | `is_member_of` | PERSON → ORG |
| Advisor / Consultant | `advisor` | PERSON → ORG |
| *(no title given or unrecognised title)* | `works_at` | PERSON → ORG |

---

## Canonical Entity Type Taxonomy

### Target taxonomy

The following 16 entity types represent the target state. The spec tracks both the canonical name and the current DB enum value.

| Canonical type | DB enum value (current) | Status | Notes |
|---|---|---|---|
| `person` | `PERSON` | ✅ Exists | Named individuals |
| `company` | `COMPANY` + `STATE_OWNED_ENTERPRISE` + `MEDIA_OR_PUBLICATION` | ⚠️ Split | Three current values collapse to one conceptual type. Keep all three in DB for now; treat them as sub-types of `company` at the product layer. Migration to consolidate is a future decision. |
| `organization` | `ORGANIZATION` + `GOVERNMENT` + `PUBLIC_INSTITUTION` | ⚠️ Split | Similarly collapsed. `GOVERNMENT` and `PUBLIC_INSTITUTION` are sub-types. Keep all three; consolidate later. |
| `country` | `COUNTRY` | ✅ Exists | Sovereign countries |
| `country_region` | `LOCATION` (partial) | ⚠️ Overloaded | `LOCATION` currently covers cities, regions, ports, corridors, infrastructure. A distinct `COUNTRY_REGION` type would separate sub-national geography from infrastructure. **Add `COUNTRY_REGION` in Phase 1 migration.** |
| `event` | `EVENT` | ✅ Exists | Named time-bounded events |
| `corporate_event` | — | ❌ Missing | IPOs, rights issues, acquisitions, mergers, listings. Currently extracted as `EVENT` or not at all. **Add `CORPORATE_EVENT` in Phase 1 migration.** |
| `educational_institution` | `PUBLIC_INSTITUTION` / `ORGANIZATION` (forced) | ⚠️ Overloaded | Universities, business schools. **Add `EDUCATIONAL_INSTITUTION` in Phase 1 migration.** |
| `exchange` | — | ❌ Missing | NYSE, JSE, NYMEX, etc. Currently not extractable. **Add `EXCHANGE` in Phase 1 migration.** |
| `facility` | `LOCATION` (partial) | ⚠️ Overloaded | Refineries, ports, plants, data centres. **Add `FACILITY` in Phase 1 migration.** |
| `industry` | `SECTOR` | ✅ Exists (rename) | DB value is `SECTOR`; canonical name is `industry`. No migration needed; rename at the display layer. |
| `language` | — | ❌ Missing | Human languages (Arabic, Hausa, Swahili). **Add `LANGUAGE` in Phase 1 migration.** |
| `law` | `LAW_OR_POLICY` | ✅ Exists (rename) | Laws, acts, regulations, policy frameworks. `law` is the canonical short form. |
| `product` | `COMMODITY` (partial) | ⚠️ Overloaded | `COMMODITY` is specifically traded raw materials. `product` is broader (software, manufactured goods). **Add `PRODUCT` in Phase 1 migration.** |
| `work_of_art` | — | ❌ Missing | Publications, reports, books, films, research papers. **Add `WORK_OF_ART` in Phase 1 migration.** |
| `entity` | — | ❌ Missing | Generic fallback for entities that don't fit any specific type. **Add `ENTITY` in Phase 1 migration.** |

### Missing DB enum values — Phase 1 migration

```sql
ALTER TYPE entity_type ADD VALUE 'COUNTRY_REGION';
ALTER TYPE entity_type ADD VALUE 'CORPORATE_EVENT';
ALTER TYPE entity_type ADD VALUE 'EDUCATIONAL_INSTITUTION';
ALTER TYPE entity_type ADD VALUE 'EXCHANGE';
ALTER TYPE entity_type ADD VALUE 'FACILITY';
ALTER TYPE entity_type ADD VALUE 'LANGUAGE';
ALTER TYPE entity_type ADD VALUE 'PRODUCT';
ALTER TYPE entity_type ADD VALUE 'WORK_OF_ART';
ALTER TYPE entity_type ADD VALUE 'ENTITY';
```

All nine are non-destructive `ADD VALUE` operations. No table rewrite required.

### What does NOT change (by design)
- `TOPIC`, `RISK`, `OPPORTUNITY`, `PROJECT` (Phase 4b thematic types) remain as-is.
- `COMPANY`, `STATE_OWNED_ENTERPRISE`, `MEDIA_OR_PUBLICATION` remain as distinct enum values; consolidation to a single `COMPANY` type is a future migration decision (requires updating all existing rows).

---

## Approach

### Phase 1 — Schema preparation ✅ Done

Migrations written and ready to apply. No pipeline code changes in this phase.

| Migration | File | What it does |
|---|---|---|
| `00045` | `supabase/migrations/00045_relationship_taxonomy_v3.sql` | Adds 37 new `relation_type` values + `anchor_derived` to `relationship_origin` |
| `00046` | `supabase/migrations/00046_entity_type_expansion_v2.sql` | Adds 9 new `entity_type` values |
| `00047` | `supabase/migrations/00047_source_relationship_type_column.sql` | Adds `interviewee_relationship_type relation_type` (nullable) to `sources` |

All migrations use `IF NOT EXISTS` for idempotency. All are non-destructive `ADD VALUE` / `ADD COLUMN` operations.

**TypeScript types — already updated** (`src/types/database.ts`):
- `RelationType` union extended with all 37 new types; deprecated types annotated in comments
- `RELATION_TYPE_VALUES` array updated with full ordered list
- `ACTIVE_RELATION_TYPE_VALUES` exported — filtered set for Zod enums and UI dropdowns (excludes deprecated and legacy)
- `RelationshipOrigin` union extended with `'anchor_derived'`
- `ENTITY_TYPE_VALUES` extended with 9 new types
- `EntityType` union updated automatically via `typeof ENTITY_TYPE_VALUES[number]`

---

### Phase 2 — Deterministic anchor relationships

**Goal**: every source with a tagged person + org creates at least one `entity_relationships` row without LLM involvement.

#### 2a. Anchor gate bypass in `persistence-gate.ts`

Add `anchorEntityIds?: ReadonlySet<string>` to `PersistenceGateInput`. At the top of `applyPersistenceGate()`, before the standard entity loop, promote all anchor entity IDs into `persistedEntityIds`:

```typescript
// Promote upload anchor entities unconditionally — humans explicitly tagged them.
// This bypass applies only to upload_anchor origin entities, not LLM-extracted ones.
if (input.anchorEntityIds) {
  for (const id of input.anchorEntityIds) {
    persistedEntityIds.add(id);
  }
}
```

The caller (`pipeline.ts`) builds `anchorEntityIds` from the `source_entities` rows for the current source where `origin = 'upload_anchor'`, queried before the gate runs.

**What this bypass does and does not do:**
- ✅ Ensures anchor entities survive the gate so their relationships are not dropped
- ✅ Anchor entities can still have `entity_mentions` rows if they earn grounded chunk mentions
- ❌ Does NOT create `entity_mentions` rows for anchor entities without textual grounding — mentions still require the standard gate
- ❌ Does NOT apply to LLM-extracted entities — the strict gate remains for all non-anchor entities

#### 2b. Anchor-driven relationship creation in `pipeline.ts`

After entity resolution (when `interviewee_entity_id` and `interviewee_org_entity_id` are both non-null on the source row), write a deterministic relationship row. This step runs **before** the persistence gate and does **not** go through it.

```typescript
if (source.interviewee_entity_id && source.interviewee_org_entity_id) {
  const relationType: RelationType =
    source.interviewee_relationship_type    // 1. uploader dropdown (most specific)
    ?? inferRelationTypeFromTitle(source.interviewee_title)  // 2. title string lookup
    ?? 'works_at';                          // 3. safe generic fallback

  await adminClient.from('entity_relationships').upsert({
    source_entity_id: source.interviewee_entity_id,
    target_entity_id: source.interviewee_org_entity_id,
    relation_type: relationType,
    confidence: 1.0,
    evidence_text: source.interviewee_title ?? null,
    interview_id: source.id,
    origin: 'anchor_derived',   // auditable: anchor_derived rows are always human-seeded
    review_status: 'approved',  // human-asserted; no review queue needed
  }, {
    onConflict: 'source_entity_id,target_entity_id,relation_type,interview_id',
    ignoreDuplicates: true,
  });
}
```

`inferRelationTypeFromTitle()` is a pure function that maps known title strings to `relation_type` values using the anchor-to-type mapping table in this spec (§ Canonical Relationship Taxonomy). It is a simple string-match lookup, not an LLM call.

#### 2c. Upload form — relationship type dropdown

Update the source upload form to include a relationship type dropdown for the primary person anchor:

| UI label | `relation_type` stored |
|---|---|
| CEO / Managing Director / President | `is_ceo_of` |
| CFO / Finance Director | `is_cfo_of` |
| CTO / Technology Director | `is_cto_of` |
| COO / Operations Director | `is_coo_of` |
| CMO / Marketing Director | `is_cmo_of` |
| CSO / Strategy Director | `is_cso_of` |
| Board member / Non-executive director | `is_board_member_of` |
| Minister / Secretary of State / Head of institution | `leads` |
| Employee / Staff / Official | `works_at` |
| Founder / Co-founder | `founded` |
| Member / Delegate | `is_member_of` |
| Advisor / Consultant | `advisor` |
| *(leave blank — infer from title or use `works_at`)* | — |

The free-text `interviewee_title` field is retained alongside the dropdown (the title string becomes `evidence_text` on the relationship row). The dropdown is optional; if left blank, `inferRelationTypeFromTitle()` is used as the fallback.

---

### Phase 3 — LLM relationship extraction upgrade

**Goal**: improve the completeness and precision of LLM-extracted relationships using the canonical taxonomy.

#### 3a. Update `ExtractionSchema` in `extraction.ts`

Replace the current `relation_type` z.enum() with the full canonical taxonomy. Deprecated types (`business_partner`, `ally`, `investor`, `subsidiary`, `regulator`, `operates_in`, `governs`) remain in the enum for backward compatibility but the prompt instructs the model never to use them for new extractions.

#### 3b. Rewrite the relationship extraction prompt block

The prompt should be restructured around these principles:

**Completeness rule** (add explicitly):
> "COMPLETENESS RULE: For every PERSON–ORG pair and every ORG–LOCATION pair that appear together in this source, you MUST extract a relationship. Omitting an obvious connection is a critical extraction error. If evidence is ambiguous, use `works_at` (person↔org) or `has_presence_in` (org↔location) with low confidence rather than omitting the relationship."

**Directionality rule** (add explicitly):
> "DIRECTION RULE: Relationships are directional. `source_entity` is the entity that holds the role or takes the action; `target_entity` is the entity the role/action is directed at. Examples: `Person → is_ceo_of → Company` (Person holds the CEO role); `Company → has_presence_in → Country` (Company has presence in Country). Do not reverse these directions."

**Evidence rule** (add explicitly):
> "EVIDENCE RULE: `evidence_text` must be a direct quote or paraphrase from the source for any relationship with `confidence ≥ 0.7`. For `confidence < 0.7`, null is acceptable. Inferred relationships with no textual support must have `confidence < 0.5`."

**Type selection guidance** (replace the current block):
Provide a condensed reference for the canonical types, grouped by use case:
- Employment/role: `works_at`, `is_ceo_of`, `is_cfo_of`, `is_cto_of`, `is_coo_of`, `is_cmo_of`, `is_cso_of`, `is_board_member_of`, `is_member_of`, `founded`, `advisor`
- Ownership/control: `is_direct_parent_of`, `is_ultimate_parent_of`, `invested_in`, `is_beneficial_owner_of`, `is_controlled_person_of`
- Geography: `has_headquarters_in`, `has_presence_in`, `is_registered_in`, `located_in`, `within`, `has_nationality`, `native_to`
- Governance/regulation: `has_jurisdiction`, `operates_in_industry`
- Events/activities: `spoke_at`, `participates_in_corporate_event`, `studied_at`, `featured_in`
- Markets/finance: `listed_on`, `traded_on`, `invested_in`
- Products/works: `manufactured_by`, `published_by`, `created_by`, `designed_by`
- Generic fallbacks: `affiliated_with` (person↔org when no specific type fits), `supplier`, `customer_of`, `competitor`, `acquirer`, `critic`

**Negative examples** (add to prompt):
> "DO NOT use `business_partner` or `ally` — they are legacy types. DO NOT use `operates_in` — use `has_presence_in` (location) or `operates_in_industry` (sector) instead. DO NOT extract a relationship based solely on two entities being mentioned in the same paragraph — there must be explicit interaction or association in the text."

#### 3c. Validation pass before persistence

Add a validation step in `pipeline.ts` after LLM extraction and before the persistence gate:

1. **Type validation**: reject any relationship with a `relation_type` not in the canonical enum. Log the unknown type and the source ID. Do not throw — silently drop the row.
2. **Evidence gate**: for relationships with `confidence ≥ 0.7` and `evidence_text = null`, set `confidence = 0.5` (downgrade) and log a warning. Do not drop the row.
3. **Self-relationship guard**: reject rows where `source_name === target_name` (same entity referencing itself).
4. **Confidence floor**: reject rows with `confidence < 0.1` (near-zero confidence adds noise without value).

#### 3d. Deduplication (no change needed)

The existing upsert with `onConflict: 'source_entity_id,target_entity_id,relation_type,interview_id'` already handles deduplication on re-ingestion. Multiple distinct `relation_type` values between the same pair produce multiple rows, which is correct. No schema change needed.

---

### Phase 4 — Contextual associations in Network Explorer and Copilot

**Goal**: make entities from the same source feel connected in the UI and retrieval layer — without storing weak semantic edges.

#### 4a. Network Explorer — contextual co-occurrence layer

The `NeighborhoodData` API response (`/api/graph/entity/[entityId]`) should include a new `contextualAssociations` array alongside the existing `relationships` array. Each entry in `contextualAssociations` represents "this entity and another entity both appeared in the same source":

```typescript
interface ContextualAssociation {
  entity: GraphNode;       // the co-appearing entity
  sourceId: string;
  sourceTitle: string;
  conductedAt: string | null;
  linkTypes: string[];     // e.g. ["interviewee", "participant"]
}
```

This data is fetched by joining `source_entities` on `source_id` for all sources the focal entity appeared in, then finding other entities linked to those sources.

In the Network Explorer UI, contextual associations are rendered as visually distinct edges — dashed, lower opacity, different colour than semantic relationship edges — and can be toggled off independently.

#### 4b. Copilot — source co-occurrence context injection

In the Copilot evidence pack construction (`/api/chat/route.ts`), when building context for an entity, include a co-occurrence block:

> "Other entities that appeared alongside [Entity X] in the same sources: [list of entity names + source titles]."

This is derived from `source_entities` joins, not from `entity_relationships`. It provides relationship context even when no semantic relationship has been extracted.

This is surfaced as supplementary context in the system prompt, clearly labelled "source co-occurrence context" so the model can distinguish it from explicit relationship claims.

---

### Phase 5 — Future governance (not in this spec)

- Manual relationship creation and editing UI → see `user-created-entities-relationships.md`
- Human review queue for `pending` relationships
- `validated_positions` auto-population from pipeline-extracted roles
- Relationship merge and deduplication across multiple sources (same pair, same type, aggregate confidence)
- Global entity deduplication across projects/tenants

---

## Validation and Deduplication Rules

### Reject conditions (row is dropped, logged, not thrown)
| Condition | Action |
|---|---|
| `relation_type` not in canonical enum | Drop + log `WARN: unknown_relation_type` |
| `source_entity_id === target_entity_id` | Drop + log `WARN: self_relationship` |
| `confidence < 0.1` | Drop + log `WARN: confidence_below_floor` |
| Either endpoint not in `persistedEntityIds` after gate | Drop (existing behaviour — keep) |

### Downgrade conditions (row is kept with modified confidence)
| Condition | Action |
|---|---|
| `confidence ≥ 0.7` AND `evidence_text IS NULL` | Downgrade confidence to `0.5`, log `WARN: high_confidence_no_evidence` |

### Deduplication
- DB upsert on `(source_entity_id, target_entity_id, relation_type, interview_id)` with `ignoreDuplicates: true`
- Multiple rows with the same `(source_entity_id, target_entity_id)` but **different** `relation_type` are **not** duplicates — they are distinct typed claims and must all be preserved
- On re-ingestion of the same source, existing rows are left unchanged (not overwritten)

---

## Constraints

- Admin client pattern for all DB writes (HANDOVER.md §3).
- OpenAI structured outputs: all Zod fields `.nullable()`, never `.optional()` or `.default()` (HANDOVER.md §3 gotcha #2).
- The persistence gate's strict rule applies to all LLM-extracted entities without exception. The bypass is scoped to `upload_anchor` origin only.
- Cascade delete on `sources` removes all `entity_relationships` rows (including `anchor_derived`). Anchor-derived rows are re-created on every pipeline run, so this is correct behaviour.
- `ALTER TYPE ... ADD VALUE` migrations are non-destructive and non-transactional in PostgreSQL — they must be run outside a transaction block in Supabase migrations.

---

## Dependencies and Related Docs

- [`entity-relationship-extraction-research.md`](./entity-relationship-extraction-research.md) — architecture investigation and tradeoff analysis. Read before implementing any phase.
- `docs/architecture/ingestion-pipeline.md` — pipeline phase order and file references.
- `docs/infrastructure/database-schema.md` — `entity_relationships`, `source_entities`, `entities` schemas; RLS policy table; enum list.
- `docs/features/to-do/user-created-entities-relationships.md` — Phase 5 UI layer (separate spec).
- `docs/features/done/human-in-the-loop.md` — Entity Editor; alias learning feeds the `entity_aliases` table that improves exact-match grounding.
- `docs/architecture/agentic-rag.md` — Copilot architecture; Phase 4 context injection touches the evidence pack construction in the chat route.

---

## Risks and Open Questions

1. **`is_direct_parent_of` vs `subsidiary` directionality inversion**: existing `subsidiary` rows have direction `(subsidiary → parent)`. New `is_direct_parent_of` rows have direction `(parent → child)`. Any query reading both must invert direction for `subsidiary`. **Consider a one-time data migration** to flip existing `subsidiary` rows into `is_direct_parent_of(parent, child)`.

2. **Migration tooling — `ADD VALUE` outside transactions**: migrations `00045` and `00046` use `IF NOT EXISTS` and must be applied outside a transaction block. Verify the team's migration runner supports this (Supabase CLI `--no-transaction` or separate statements).

3. **Anchor entity ID availability**: `interviewee_entity_id` and `interviewee_org_entity_id` are populated during `resolveExtractedEntities`. If entity resolution fails for one anchor, skip the anchor relationship creation gracefully — do not error.

4. **Network Explorer visual design (Phase 4)**: the contextual co-occurrence layer requires a visual design decision (dashed vs solid, colour, toggle) before the API change is implemented.

5. **LLM type distribution for v3 taxonomy**: with 44+ active types, run extraction tests on 10+ sources after Phase 3 prompt changes to validate distribution — confirm `works_at`/`is_ceo_of` are used for person↔org roles and `affiliated_with` is no longer used as a default.

---

## Acceptance / How to Validate

### Phase 1 (schema — migrations `00045`, `00046`, `00047`)
- Migrations `00045`, `00046`, `00047` apply cleanly with no errors.
- `\dT+ relation_type` shows all 37 new values (`works_at`, `leads`, `is_ceo_of`, …, `operated_by`, `spoken_in`).
- `\dT+ entity_type` shows all 9 new values (`COUNTRY_REGION`, `CORPORATE_EVENT`, …, `ENTITY`).
- `\dT+ relationship_origin` shows `anchor_derived`.
- `sources` table has `interviewee_relationship_type` column (nullable, `relation_type`).
- No existing rows in any table are affected.

### Phase 2 (anchor relationships)
- Upload a source with `interviewee_name = "Raji Bashir"`, `interviewee_org = "NNPC"`, `interviewee_title = "CEO"`. After processing: `entity_relationships` contains a row with `relation_type = is_ceo_of` (from title inference or form dropdown), `confidence = 1.0`, `origin = anchor_derived`, `review_status = approved`.
- Re-ingest the same source. No second row is created for the anchor relationship.
- Upload a source where the interviewee's name is consistently misspelled in ASR. The interviewee entity still appears as an endpoint in `entity_relationships` (anchor bypass).
- Upload a source with no interviewee org tagging. No anchor-derived row is created. No error.
- Two entities from the same source — one anchor, one LLM-extracted — both survive the gate. A relationship between them (extracted by LLM) is persisted.

### Phase 3 (LLM extraction)
- LLM extraction on a source with an explicit CEO description ("Mr X, CEO of Company Y"): the relationship row has `relation_type = is_ceo_of`, not `affiliated_with`.
- A source with a supply relationship ("Company A sells equipment to Company B"): two rows — `Company A → supplier → Company B` and `Company B → customer_of → Company A` (if both are extracted).
- A relationship with `confidence = 0.8` and `evidence_text = null` is written with `confidence = 0.5` after the downgrade rule.
- No `business_partner` or `ally` rows appear in new extraction runs.
- No `operates_in` rows appear in new extraction runs (replaced by `has_presence_in` or `operates_in_industry`).

### Phase 4 (contextual layer)
- Navigate to an entity in the Network Explorer that has `source_entities` rows but few `entity_relationships` rows. The graph shows contextual association edges (dashed) to co-appearing entities from the same source.
- Toggle off the contextual layer. Only semantic relationship edges remain.
- In the Copilot, ask about an entity. The answer includes co-occurrence context ("Also appeared alongside X in source Y") even when no explicit relationship has been extracted.

---

## Implementation Log

- 2026-05-18: Architecture investigation complete. Root causes: persistence gate, no anchor→relationship creation, coarse taxonomy. See research doc.
- 2026-05-18: Spec rewritten. Canonical relationship taxonomy defined. 16-type entity taxonomy mapped to DB enums. 5-phase implementation plan.
- 2026-05-18: **Phase 1 complete.** Migrations `00045`, `00046`, `00047` written. `src/types/database.ts` updated: `RelationType` (51 total values, 44 active), `ACTIVE_RELATION_TYPE_VALUES` exported, `RelationshipOrigin` + `anchor_derived`, `ENTITY_TYPE_VALUES` + 9 new types. `leads` and `operated_by` added to taxonomy resolving open questions. Deprecated types annotated.
- 2026-05-18: **Phase 2 complete (2a + 2b).**  
  **2a (Add Source form):** Migration `00048` applied: added `represents` relation type; replaced `interviewee_relationship_type relation_type` (single) with `interviewee_relationship_types relation_type[]` (array); added `participant_anchor_relationships JSONB`. Upload form now has a multi-select relationship type toggle for the primary person→org anchor (14 active types), retains free-text exact title field, and extends the "Additional known entities" section with affiliated org input + per-participant relationship type toggles for PERSON rows. All three upload API routes (audio, PDF, text) parse and persist `interviewee_relationship_types`. `writeAnchorDerivedRelationships` in `source-entities-writer.ts` creates `origin='anchor_derived'` rows in `entity_relationships` at upload time for both primary anchor and participant pairs. `parseRelationshipTypes` validator added to `validate-interview-anchor.ts`.   Fallback logic preserved: if no type is selected, title inference → `works_at` default applies in pipeline (see 2b below).
- 2026-05-18: **Phase 2b (Pipeline fallback) complete.** `inferRelationTypeFromTitle()` added to `upload-metadata.ts` — maps common title strings (CEO, CFO, founder, minister, etc.) to the canonical `relation_type`. `persistence-gate.ts` gains `anchorEntityIds?: ReadonlySet<string>` — upload-anchor entities are unconditionally promoted into `persistedEntityIds` before the grounding gate so their LLM-extracted relationships are never silently dropped. `pipeline.ts` queries all `source_entities` with `origin='upload_anchor'` to build the full anchor set (interviewee + org + participants), passes it to `applyPersistenceGate`, and runs fallback relationship creation after `writeAnchorSourceEntities`: if `interviewee_relationship_types` is empty, infer from `interviewee_title` → `works_at`. All four pipeline entry-points (`processTranscription`, `reprocessInterviewFromReview`, `processDocument`, `processTextInterview`) now select and pass `interviewee_title` + `interviewee_relationship_types`.
