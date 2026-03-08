# Sovereign — Intelligence & Commercial Copilot: Execution Plan v2

**Date**: March 8, 2026
**Author**: Principal Product Architect + Technical Lead
**Status**: P1 COMPLETE — P2 next
**Revision**: v2 — Restructured for shortest credible path to CEO demo

---

## Guiding Principle

Everything in this plan is optimized for one question:

> **What is the shortest credible path to a product where a CM can say
> "Prepare me for a pitch with Company X" and get a genuinely useful,
> evidence-backed briefing that no competitor can produce?**

That is the hero workflow. That is what we sell to the CEO.
Every phase in the critical path exists only because the hero workflow cannot work without it.
Everything else is deferred — not deleted, but explicitly sequenced after the demo is credible.

---

## SECTION A — CEO-DEMO / PILOT CRITICAL PATH

Six phases. Tight scope. Commercially motivated ordering.

```
P1  Chunk & Ingestion Quality Fix    ✅ COMPLETE
 ↓
P2  Entity Resolution & Relationship Fix  ← NEXT
 ↓
P3  Keyword Search + Smarter Retrieval
 ↓
P4  Evidence-First Chat
 ↓
P5  Meeting Preparation Mode         ← HERO WORKFLOW
 ↓
P6  Follow-up Lite
```

Meeting preparation arrives at Phase 5, not Phase 9.
Phases 1–4 are the minimum credible foundation to make Phase 5 actually work.
Phase 6 is lightweight and rounds out the commercial story for the CEO demo.

---

### P1 — Chunk & Ingestion Quality Fix ✅ COMPLETE

**Objective**: Fix chunk splitting so evidence doesn't break at boundaries, and add basic API retry so re-processing is safe.

**Why it is in the critical path**: Meeting preparation (P5) will display specific interview excerpts as evidence. If chunks split mid-sentence, evidence looks broken and unprofessional. This is visible in the demo. Additionally, we need to re-process existing interviews after this fix, so a basic retry wrapper prevents random API failures from blocking us.

**Exact scope**:
- Implement chunk overlap using the already-configured `chunkOverlap: 50` tokens (currently unused)
- Fix sentence splitting regex to handle abbreviations ("Dr.", "U.S.", "Inc."), numbered lists, and common edge cases
- Add min/max token enforcement: minimum 50, maximum 600, with forced split/merge at boundaries
- Add a retry wrapper with exponential backoff (3 retries, 1s/2s/4s) for all OpenAI API calls (extraction + embeddings)
- Batch embedding requests (groups of max 100 texts per call)

**Explicitly out of scope**:
- Context preamble per chunk (nice, not critical for demo)
- Semantic/LLM-based chunking
- `chunkPlainText` improvements (documents are not the hero workflow; audio interviews are)
- Full reprocessing pipeline with step tracking (deferred to hardening)
- Changing the embedding model or dimensions

**Success criteria**:
- Process a test interview: zero chunks under 50 tokens, zero chunks over 600 tokens
- Manually inspect 10 chunk boundaries: zero mid-sentence splits
- Simulate OpenAI 500 error on first call: retry succeeds without manual intervention
- Re-process an existing interview with new chunking: completes without error

#### P1 Implementation Log

**Status**: ✅ ALL 5 SUB-STEPS COMPLETE — Not yet tested with a fresh interview upload.

| Sub-step | File(s) modified | What was done |
|----------|-----------------|---------------|
| P1.1 Sentence splitting | `src/lib/ai/chunking.ts` | Replaced broken regex `/[^.!?]+[.!?]+/g` with `splitSentences()` — handles 35 abbreviations (Dr., Inc., U.S., etc.), single-letter initials, multi-char initials (U.S., J.P.), and trailing text without punctuation. Boundary detection requires uppercase/quote after period+space. |
| P1.2 Chunk overlap | `src/lib/ai/chunking.ts` | Added `getOverlapText()` helper. Last ~50 tokens of each emitted chunk are carried forward to the next chunk within the same speaker group. `overlapLen` tracked separately for accurate timestamp interpolation. Applied to both `chunkTranscript` and `chunkPlainText`. |
| P1.3 Min/max enforcement | `src/lib/ai/chunking.ts` | Added `enforceChunkBounds()` post-processor that runs after both chunking functions. Splits chunks >600 tokens at word boundaries via `splitOversizedChunk()`. Merges chunks <50 tokens into previous same-speaker neighbor (guarded by max cap). Reassigns chunk indices. Helper functions: `getChunkBody()`, `formatChunkContent()`. |
| P1.4 Retry wrapper | `src/lib/ai/retry.ts` (NEW), `src/lib/ai/extraction.ts`, `src/lib/ai/embeddings.ts` | Created `withRetry(fn, label, options?)` — 3 retries, 1s/2s/4s exponential backoff. Only retries on transient errors (429, 5xx, network failures). Non-retryable errors (4xx) thrown immediately. Wrapped `generateObject()` in extraction and `fetchEmbeddingBatch()` in embeddings. Error objects now carry `.status` for accurate retryability detection. |
| P1.5 Batch embeddings | `src/lib/ai/embeddings.ts` | `generateEmbeddings()` now splits inputs into groups of 100 (`EMBEDDING_BATCH_SIZE`). Each batch independently retried. Results concatenated in order. For ≤100 texts (common case), single call as before. |

**Testing needed**: Upload a new interview and verify in Supabase that `interview_chunks` show no mid-sentence splits, no chunks under ~200 chars or over ~2400 chars, and that overlap text appears at chunk boundaries within same-speaker groups.

---

### P2 — Entity Resolution & Relationship Fix

**Objective**: Stop silently losing relationships and stop degrading entity descriptions.

**Why it is in the critical path**: Meeting preparation (P5) needs to show "Company X has these relationships: Partner Y, Regulator Z" with evidence. Right now, relationships are silently dropped when extraction names don't match resolution names. If the relationship graph is incomplete, the briefing is incomplete. This is the single most damaging data bug in the system.

**Exact scope**:
- Fix relationship persistence to use the **resolved entity ID map** instead of `normalizeEntityName(rel.source_name)`. After resolution completes, rebuild the relationship source/target mapping using actual resolved IDs — not raw extraction names.
- Add extraction-time validation: log warnings when a relationship references an entity name that doesn't match any extracted entity's `canonical_name`
- Deduplicate entities at extraction time: if GPT returns two entities with the same normalized name, merge them before passing to resolution
- Protect entity descriptions from regression: never overwrite a description that contains role/title/affiliation keywords with one that doesn't. Simple heuristic: count factual tokens (title, CEO, Minister, Director, headquartered, founded, etc.) and prefer higher count.

**Explicitly out of scope**:
- Cross-interview entity merging (`canonical_entity_id` workflow)
- Entity type correction (PERSON vs COMPANY)
- Resolution confidence tracking (useful but not demo-critical)
- Changes to the extraction prompt itself
- Full grounding overhaul (separate hardening phase)

**Success criteria**:
- Process an interview where GPT misspells an entity name in a relationship: relationship persists with correct entity IDs
- Query `entity_relationships`: zero orphaned references (all source/target IDs exist in `entities`)
- Process the same interview twice: entity descriptions never get worse (inspect 5 entities manually)
- Process an interview where GPT returns duplicate entities: only one entity created per normalized name

---

### P3 — Keyword Search + Smarter Retrieval

**Objective**: Make search actually find chunks that mention a specific company, person, or term — not just semantically similar chunks.

**Why it is in the critical path**: When a CM asks "Prepare me for a pitch with Company X", retrieval must find every chunk that mentions Company X. Vector-only search is unreliable for proper nouns. Adding a keyword component is the single highest-leverage retrieval improvement. Without it, meeting preparation will miss critical evidence that exists in the database.

**Exact scope**:
- Add a keyword scoring component to `hybrid_search`: use `pg_trgm` similarity on chunk `content` alongside vector cosine similarity. This requires adding a GIN trigram index on `interview_chunks.content`.
- Implement score fusion: combine vector similarity and keyword relevance using Reciprocal Rank Fusion (RRF). Retrieve top-15 by vector, top-15 by keyword, fuse into ranked list.
- Replace the fixed 20-chunk injection with a dynamic cutoff: include only chunks above a fused relevance threshold, with a floor of 3 and ceiling of 12 chunks.
- Activate the existing `filter_project_ids` parameter: always pass the user's current project when in project context.
- Add entity-aware query rewriting: before search, resolve entity names in the query against the knowledge graph (including aliases), and append resolved canonical names to the search query for better keyword matching.

**Explicitly out of scope**:
- LLM-based reranking (deferred to hardening — adds latency and cost)
- MMR for chunk diversity (deferred)
- HyDE / hypothetical document embedding (deferred)
- Multi-query decomposition (deferred)
- Full-text search via `ts_vector`/`ts_query` (trigram is sufficient for entity names and simpler to implement)
- Country/topic filter activation (useful but not demo-critical since project filter covers most cases)

**Success criteria**:
- Query "What did Minister X say about ports?": chunks mentioning Minister X appear in top-3 results
- Query "Company Y": all chunks that literally mention Company Y are retrieved, regardless of embedding similarity
- No chat message injects more than 12 chunks or fewer than 3
- Entity alias query: searching for a known alias of Entity Z retrieves Entity Z's chunks
- Chat latency increase is under 500ms compared to current

---

### P4 — Evidence-First Chat

**Objective**: Transform chat responses from generic-sounding answers into evidence-backed intelligence briefs.

**Why it is in the critical path**: This is the last step before meeting preparation. If regular chat already feels evidence-backed, meeting preparation (P5) inherits that quality. If chat still sounds generic and unsourced, no amount of structured formatting in P5 will fix it. This phase makes the difference between "AI assistant that sounds smart" and "intelligence system with provenance."

**Exact scope**:
- Inject entity context alongside retrieved chunks: for each entity mentioned in retrieved chunks, include its description and top relationships from the knowledge graph. Query `entities` + `entity_relationships` for entities referenced in chunk metadata.
- Restructure the system prompt's context block: instead of a flat numbered list of chunks, group evidence by source interview. Include interview title, interviewee name, and date alongside chunks.
- Add an explicit "What Sovereign Knows" vs "General Knowledge" distinction in the system prompt directive: instruct the model to clearly separate claims backed by interview intelligence from general reasoning or web search results.
- Add confidence transparency: instruct the model that when fewer than 3 relevant chunks are found, it must explicitly state that evidence is thin and the answer may be incomplete.
- Reduce citation noise: only include citation markers for chunks that contain direct evidence for the claim being made (instruction in system prompt, not post-processing).

**Explicitly out of scope**:
- Meeting preparation structured output (that's P5)
- Citation post-processing validation (deferred)
- Query understanding/expansion (deferred)
- Changes to tool definitions (lookupEntity, lookupRelationships, etc. stay as-is)
- Changes to the TBY persona identity or jargon

**Success criteria**:
- Query "Tell me about Company X": response includes entity description, known relationships, and specific interview excerpts — not a generic paragraph
- Query with thin evidence (entity mentioned once): response explicitly says evidence is limited
- Responses visibly separate "From our interviews: ..." from "More broadly: ..."
- Token usage per message decreases vs. current (fewer but more relevant chunks in context)
- Blind comparison of 10 queries (current vs. new): new responses are rated more specific and evidence-backed in 7/10 cases

---

### P5 — Meeting Preparation Mode

**Objective**: Deliver the hero workflow — "Prepare me for a pitch with Company X" produces a structured, evidence-backed briefing.

**Why it is in the critical path**: This is the product. This is what we demo to the CEO. Everything before this phase exists to make this one work.

**Exact scope**:
- Detect preparation intent in chat: recognize queries like "prepare me for a meeting with X", "brief me on Company Y", "what should I know before pitching Z". Use a lightweight LLM classification call (GPT-4o-mini, single boolean + target entity extraction) at the start of the chat route.
- When preparation intent is detected, switch to a structured pipeline:
  1. **Resolve target**: identify the target entity/entities from the query. Use existing entity lookup (normalized name + aliases).
  2. **Gather intelligence**: fetch all entity mentions across interviews (with chunk context), all relationships (with evidence and sentiment), and relevant chunks via hybrid search.
  3. **Generate structured briefing**: send gathered intelligence to GPT-4o with a preparation-specific system prompt that produces markdown with these sections:
     - **Background**: who/what is the target, based on entity description and mentions
     - **Key Intelligence**: most important facts from interviews, with citations
     - **Relationship Map**: who the target is connected to, what kind of relationship, sentiment
     - **Risks & Opportunities**: from interview context
     - **Suggested Talking Points**: 3-5 evidence-backed conversation starters
     - **Knowledge Gaps**: what Sovereign does NOT know — what the CM should try to learn in the meeting
- Reuse the existing report intelligence layer concepts (evidence ledger pattern from `report-generation.ts`) adapted for real-time streaming output.
- Handle gracefully: unknown entities (no intelligence → say so + suggest web search), thin intelligence (few mentions → shorter briefing with explicit gaps).

**Explicitly out of scope**:
- Calendar integration
- CRM / War Room integration
- PDF export of briefings (reuse report PDF infrastructure later)
- Multi-project preparation
- Preparation for abstract topics without a target entity (e.g., "prepare me for Angola" without a specific company/person — use regular chat for this)
- Saving/versioning preparation briefings

**Success criteria**:
- "Prepare me for a pitch with [well-covered entity]": produces briefing with Background, Key Intelligence (≥3 cited facts), Relationship Map (≥2 relationships), Talking Points (≥3), and Knowledge Gaps
- "Prepare me for a meeting with [entity mentioned once]": produces shorter briefing, Knowledge Gaps section is substantial, system doesn't fabricate depth
- "Prepare me for a meeting with [unknown entity]": graceful response explaining no internal intelligence exists, suggests what to look for
- Briefing streams in under 15 seconds for well-covered entities
- Qualitative: a product tester rates 7/10 briefings as "would actually use this before a real meeting"

---

### P6 — Follow-up Lite

**Objective**: After a meeting, help the CM summarize what happened, identify next steps, and draft a follow-up message — without complex ingestion.

**Why it is in the critical path**: The CEO demo needs to show the full commercial cycle: prepare → meet → follow up. Without follow-up, the story is incomplete. But the full follow-up vision (notes ingestion, entity extraction, graph updates) is too heavy for the first demo. This phase delivers a lightweight version that is useful and demonstrable without the infrastructure cost.

**Exact scope**:
- Detect follow-up intent in chat: recognize queries like "I just met with X, help me follow up", "draft a follow-up for my meeting with Y", "what should I do after meeting Z".
- When follow-up intent is detected, the system:
  1. **Asks for context** (if not provided): prompt the CM to briefly describe what was discussed, what they learned, what was agreed.
  2. **Cross-references with existing intelligence**: match entities mentioned by the CM against the knowledge graph. Surface any pre-existing intelligence that's relevant to what was discussed.
  3. **Generates follow-up output** with three parts:
     - **Meeting Summary**: structured summary of what the CM described
     - **Suggested Next Steps**: specific actions based on the meeting + existing intelligence (e.g., "You mentioned Company X is interested in infrastructure — Minister Y discussed this topic in interview Z, consider referencing this")
     - **Follow-up Message Draft**: a professional message in TBY tone that references specific intelligence, ready for the CM to edit and send
- The follow-up works entirely within the existing chat — no new pages, no ingestion pipeline, no database writes beyond normal chat history.

**Explicitly out of scope**:
- Meeting notes ingestion into the knowledge graph (deferred to hardening)
- Entity extraction from meeting descriptions (deferred)
- Relationship graph updates from follow-up context (deferred)
- New database tables or schema changes
- Email integration
- CRM pipeline updates
- Saving follow-up drafts outside of chat

**Success criteria**:
- CM describes a meeting with a known entity: follow-up references specific prior intelligence from interviews (not generic advice)
- Follow-up message draft is in TBY professional tone and mentions specific data points
- Suggested next steps include at least one reference to existing Sovereign intelligence
- The entire follow-up flow works within a single chat conversation (no page navigation required)
- Qualitative: product tester rates the follow-up draft as "usable with minor edits" on 6/10 test cases

---

## SECTION B — HARDENING / SCALE / LATER

Everything below is important. None of it is required for the first CEO demo.
These are ordered by priority within the hardening track, not by dependency on the critical path.

---

### H1 — Pipeline Resilience & Reprocessing (HIGH PRIORITY)

**What it includes**:
- Full `reprocessInterview(interviewId, fromStep?)` function with step tracking
- Pipeline step state machine stored in interview metadata
- Human-corrected alias preservation (`source = 'user_correction'`) during re-processing
- Error recovery: set status to FAILED with clear error, allow retry from failed step
- Partial re-run capability (skip transcription, resume from extraction/embedding/grounding)

**Why deferred**: The critical path includes a basic retry wrapper (P1) which is sufficient for initial re-processing. Full step tracking and reprocessing add state-machine complexity that is not needed for the demo but is essential before production use.

**When to do it**: First hardening phase after the CEO demo. Needed before processing large batches of interviews reliably.

---

### H2 — Grounding Precision (HIGH PRIORITY)

**What it includes**:
- Remove one-mention-per-chunk limitation in `groundSingleEntity()`
- Raise anchor context similarity threshold (0.55 → 0.65)
- Broaden fuzzy matching regex for non-Latin scripts and lowercase names
- Fix NULL `chunk_id` uniqueness issue (partial unique index or sentinel UUID)
- Grounding coverage metric: log percentage of entities with chunk-level vs. interview-level mentions
- Improve context excerpt extraction (sentence-aware, not character-count-based)

**Why deferred**: Current grounding works for the common case (exact name matches, aliases). The edge cases (non-Latin names, anchor false positives, per-chunk dedup) affect a minority of entities. For the demo, the majority-case grounding is sufficient. For production with diverse interviews across the Global South, this becomes critical.

**When to do it**: Shortly after H1. Important for non-English interview quality.

---

### H3 — LLM Reranking (MEDIUM PRIORITY)

**What it includes**:
- After initial hybrid retrieval (P3), add a reranking step: GPT-4o-mini scores relevance of each candidate chunk against the query
- Adaptive context window: use reranker confidence scores to determine how many chunks to include (replace the static floor/ceiling from P3 with score-driven inclusion)
- MMR (Maximal Marginal Relevance) to reduce redundancy among selected chunks

**Why deferred**: Keyword search (P3) already dramatically improves retrieval for entity-specific queries. LLM reranking adds 500ms–1s latency and cost per message. The marginal improvement is real but not necessary for the demo. It becomes important when interview volume grows and retrieval noise increases.

**When to do it**: After the system is in use and we can measure retrieval quality to validate the improvement.

---

### H4 — Query Understanding & Expansion (MEDIUM PRIORITY)

**What it includes**:
- Query type classification (entity / sector / comparison / preparation / exploration)
- Multi-query decomposition for complex queries
- HyDE (Hypothetical Document Embedding) for vague queries
- Conversational context tracking (use chat history for retrieval, not just the latest message)

**Why deferred**: Entity-aware query rewriting (in P3) covers the most important case for the demo: resolving entity names and aliases. The advanced query understanding techniques improve recall for complex and vague queries, but the demo scenario is targeted ("prepare me for X"), not vague. These techniques pay off at scale and for general-purpose chat, not for the hero workflow.

**When to do it**: After measuring where chat retrieval fails most often. Let real usage patterns guide which techniques to prioritize.

---

### H5 — Follow-up Deep: Notes Ingestion & Graph Updates (MEDIUM PRIORITY)

**What it includes**:
- Meeting notes ingestion mini-pipeline: accept pasted text, extract entities and relationships, store as `source_type: 'document'` interview with chunking and embedding
- Entity extraction from meeting descriptions
- Knowledge graph updates: new entities, relationships, and mentions from notes integrated into existing graph
- Conflict resolution: when extracted entities from notes conflict with existing entity data

**Why deferred**: Follow-up Lite (P6) delivers the demo-critical value (summary, next steps, draft message) without writing to the database. Full notes ingestion requires entity extraction on messy unstructured text, conflict resolution with existing data, and schema/pipeline work. This is valuable for the intelligence cycle but adds complexity that the first demo doesn't need.

**When to do it**: After the CEO demo validates that CMs actually use follow-up. If they don't, this investment is premature.

---

### H6 — Data Hygiene & Security Hardening (MEDIUM PRIORITY)

**What it includes**:
- Add RLS to `entity_aliases` (currently no RLS — any authenticated user can read/write any alias)
- Add DELETE policies to `entities`, `entity_mentions`, `entity_relationships`, `content_snippets`
- Data hygiene migration: remove orphaned mentions, deduplicate aliases, remove duplicate interview-level fallback rows
- Constraint or trigger to prevent duplicate `(entity_id, interview_id, NULL)` in entity_mentions
- Full RLS policy audit and documentation

**Why deferred**: These are security and data integrity issues. They are tolerable during demo/pilot with a small trusted user group. They become critical before opening access to a wider team or before any production deployment with real client data.

**When to do it**: Before production deployment (Phase 4 in the original ROADMAP.md). Non-negotiable before real multi-tenant usage.

---

### H7 — Quality Feedback & Analytics (LOWER PRIORITY)

**What it includes**:
- Retrieval analytics logging (which chunks retrieved, reranked, cited per message)
- User feedback mechanism (thumbs up/down with optional comment on chat responses)
- Citation accuracy checker (compare cited chunks against response content)
- Entity quality dashboard (resolution confidence, grounding coverage, description completeness)
- Pipeline health dashboard (success/failure rates per step, processing time)

**Why deferred**: Measurement infrastructure is important for continuous improvement but adds zero user-facing value. The CEO does not care about dashboards that measure internal system health. Build this when the system is in production use and we need data to prioritize further improvements.

**When to do it**: After production deployment, when real usage generates enough data to make analytics meaningful.

---

## ORDER OF EXECUTION — FULL PICTURE

```
CEO-DEMO CRITICAL PATH                    HARDENING / SCALE
─────────────────────                      ────────────────────

P1  Chunk & Ingestion Quality Fix ✅
 ↓
P2  Entity Resolution & Relationship Fix ← NEXT
 ↓
P3  Keyword Search + Smarter Retrieval
 ↓
P4  Evidence-First Chat
 ↓
P5  Meeting Preparation Mode ★
 ↓
P6  Follow-up Lite
 ↓
 ╰──────────────────────────────────────→  H1  Pipeline Resilience
                                            ↓
                                           H2  Grounding Precision
                                            ↓
                                           H3  LLM Reranking
                                            ↓
                                           H4  Query Expansion
                                            ↓
                                           H5  Follow-up Deep
                                            ↓
                                           H6  Data Hygiene & Security
                                            ↓
                                           H7  Quality Feedback & Analytics
```

---

## WHY THIS VERSION IS BETTER

### 1. Meeting preparation arrives 4 phases earlier

The original roadmap placed meeting preparation at position 9 of 11 (Phase CC-3), behind six foundation phases and two commercial phases. In this version, it arrives at position 5 of 6. The critical path is cut nearly in half.

### 2. Only truly blocking work is in the critical path

The original roadmap treated all foundation improvements as prerequisites. In reality:
- **Full grounding overhaul** (non-Latin regex, anchor threshold tuning, per-chunk dedup) improves edge cases but isn't needed for a demo with English-language interviews.
- **LLM reranking** improves retrieval marginally over keyword search — not enough to justify the latency cost before we validate the product.
- **Query understanding & expansion** (HyDE, multi-query, classification) helps vague queries, but the hero workflow is targeted ("prepare me for X"), not vague.
- **Data hygiene & security** matters for production, not for a demo with a trusted user group.
- **Quality feedback** matters for iteration, not for a first impression.

None of these are deleted. They are sequenced after the demo, where they belong.

### 3. Each critical path phase is implementable in a focused session

| Phase | Estimated complexity | Status |
|-------|---------------------|--------|
| P1: Chunk fix + retry wrapper | 1 focused session | ✅ DONE |
| P2: Relationship fix + description protection | 1 focused session | ← NEXT |
| P3: Keyword search + dynamic cutoff + alias rewriting | 1–2 focused sessions | |
| P4: Evidence-first chat context restructuring | 1 focused session | |
| P5: Meeting preparation mode | 2 focused sessions | |
| P6: Follow-up lite | 1 focused session | |

Total: roughly 7–8 focused sessions for the complete critical path. The original plan had 11 phases, many of which were multi-session programs.

### 4. Follow-up is lightweight enough to demo, deep enough to sell

The original Follow-up Copilot (CC-4) required a meeting notes ingestion pipeline, entity extraction from unstructured text, and knowledge graph updates — essentially a second ingestion system. That is a mini-program, not a phase.

Follow-up Lite works entirely within chat: the CM describes the meeting, the system cross-references with existing intelligence, and generates next steps + a draft message. No new tables, no ingestion, no graph writes. This is demo-credible and useful, and it validates whether CMs actually want follow-up before we invest in the deep version.

### 5. The story for the CEO is complete

The demo can show:
1. Upload an interview → pipeline extracts entities, relationships, intelligence (existing)
2. Ask the chat about a company → evidence-backed answer with citations (P4)
3. "Prepare me for a pitch with Company X" → structured briefing with talking points (P5)
4. After the meeting: "Help me follow up with Company X" → follow-up draft (P6)

That is a complete commercial intelligence cycle. Not a feature list — a workflow.

### 6. The deferred work is clearly prioritized

Hardening phases are ordered by impact:
- **H1 (Pipeline Resilience)** and **H2 (Grounding)** are high priority — needed before processing many interviews in production.
- **H3 (Reranking)** and **H4 (Query Expansion)** are medium priority — improve quality but the system works without them.
- **H5 (Follow-up Deep)** is medium priority — depends on validating that CMs use Follow-up Lite.
- **H6 (Security)** is medium priority but hard-gated before production multi-tenant deployment.
- **H7 (Analytics)** is lower priority — useful only when there's enough usage to measure.

This makes the next planning conversation after the CEO demo straightforward: pick up H1 and H2, then reassess.

---

## HANDOVER / IMPLEMENTATION NOTES FOR NEXT AGENT

### Current State (as of March 8, 2026)

**P1 is fully implemented but not yet validated by the user with a fresh interview upload.** The user reported a browser freeze issue during their attempt to test, which was diagnosed as a Supabase Auth rate-limiting problem (429 errors from too many rapid auth requests from the `/chat` page), NOT related to P1 changes. The rate limit clears by closing all tabs, waiting 30s, and opening a single fresh tab. The dev server was restarted cleanly.

### Files Modified in P1

| File | What changed |
|------|-------------|
| `src/lib/ai/chunking.ts` | Replaced sentence regex with `splitSentences()` (~40 lines), added `getOverlapText()`, added `enforceChunkBounds()` post-processor with `splitOversizedChunk()`/merge logic, added constants `CHUNK_MIN_TOKENS=50`, `CHUNK_MAX_TOKENS=600`. Both `chunkTranscript` and `chunkPlainText` call `enforceChunkBounds()` before returning. |
| `src/lib/ai/retry.ts` | **NEW FILE**. Exports `withRetry<T>(fn, label, options?)`. Retries transient errors (429, 5xx, network). 3 retries, exponential backoff 1s/2s/4s. |
| `src/lib/ai/embeddings.ts` | Added `fetchEmbeddingBatch()` extracted from old inline fetch. `generateEmbeddings()` now splits into batches of 100, each wrapped with `withRetry`. Double-cast `(err as unknown as Record<string, unknown>).status` to avoid TS error. |
| `src/lib/ai/extraction.ts` | Wrapped `generateObject()` call with `withRetry(..., "extractIntelligence")`. |

### How to Continue — P2: Entity Resolution & Relationship Fix

**Read these files first** (they are the working context for P2):
- `HANDOVER.md` — full system context, architecture, constraints
- `src/lib/ai/pipeline.ts` — the orchestrator that calls extraction → resolution → persistence
- `src/lib/ai/entity-resolution.ts` — current resolution logic (aliases, normalization, matching)
- `src/lib/ai/persistence.ts` — where entities, relationships, and mentions are written to Supabase
- `src/types/intelligence.ts` — TypeScript types for extracted data (entities, relationships, etc.)

**P2 scope (from this roadmap above)**:
1. Fix relationship persistence to use the **resolved entity ID map** instead of `normalizeEntityName(rel.source_name)`. After resolution, rebuild relationship source/target mapping using actual resolved IDs.
2. Add extraction-time validation: log warnings when a relationship references an entity name not in extracted entities.
3. Deduplicate entities at extraction time: merge entities with the same normalized name before resolution.
4. Protect entity descriptions from regression: never overwrite a description with one that has fewer factual keywords (title, CEO, Minister, Director, headquartered, founded, etc.).

**Critical architectural constraint**: The app uses a Supabase admin client pattern — writes go through `createAdminClient()` to bypass RLS. Auth uses `token_hash` flow. See `HANDOVER.md` for details.

**Execution protocol**: Work phase by phase, break each phase into sub-steps. After each sub-step: stop, explain what changed, explain how to test, wait for user feedback. The user speaks Spanish sometimes. Robustness > speed.

**Known issue**: The `/chat` page can trigger Supabase Auth rate-limiting (429) if many tabs are open or rapid re-renders occur. This is NOT a code bug — it's a usage pattern issue. If the user reports browser freezes, advise: close all tabs, wait 30s, open one fresh tab.

**End of execution plan v2.**
Optimized for: shortest credible path to a product that sells.
