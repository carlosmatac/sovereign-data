# Interview Transcript Review & Reviewed Reprocessing

> Human-corrected transcripts and structured seed entities drive a second, authoritative ingestion pass — without erasing immutable ASR output.

This document describes **Phase 3.6**: the transcript review UI, the `interview_review_entities` table, and **reviewed reprocessing**. It complements the [Entity Editor](./human-in-the-loop.md) (post-hoc canonical fixes) and the [ingestion pipeline](../architecture/ingestion-pipeline.md).

---

## Problems addressed

- ASR mistranscribes difficult names → missed mentions across chunks.
- The model misses important entities entirely.
- Corrections on the interview page alone do not re-chunk or re-embed; the vector layer and graph stay tied to the old text.

---

## Three transcript layers

| Layer | Where it lives | Purpose |
|-------|----------------|---------|
| **Raw** | `interviews.transcript_full` | Immutable speaker-labeled AssemblyAI output. Never overwritten for audit. |
| **Auto display** | `interviews.transcript_display` | Still populated on ingest (`normalizeTranscriptDisplay`). The interview **detail** transcript card shows **raw** only; editors fix text via **Transcript review**. |
| **Reviewed** | `interviews.reviewed_utterances` | Editor-owned JSON array of utterances (`speaker`, `text`, `start`, `end`). **Only** this layer feeds reviewed reprocessing. |

---

## Architecture rules (locked)

### 1. Single source of truth on reviewed pass

For **reviewed reprocessing**, `reviewed_utterances` is the **sole** transcript source:

- **Extraction** uses **reviewed full text** built from these utterances only (e.g. concatenated text consistent with the initial pipeline). **No** mixing of `transcript_full`, AssemblyAI `text`, or `transcript_display` in that pass.
- **Chunking, embeddings, grounding, relationships** use **only** utterances derived from `reviewed_utterances`.

### 2. Human seed entities are strong inputs

Rows in **`interview_review_entities`** are **not** passive annotations. On reviewed reprocess they must:

- Be injected into the extraction prompt / context so the model **must** reconcile them with the reviewed text.
- Drive **mention recovery** and **relationship extraction** (with evidence) together with model-discovered entities.
- Flow through **`resolveExtractedEntities`**, **`groundEntityMentions`**, and relationship upserts so the **persisted graph** reflects reviewer intent.

### 3. Failure-safe rebuild (MVP)

- **Compute first**: Run extraction, chunking, embeddings, and assemble all new rows **before** deleting existing derived data.
- **Swap in one transaction**: `BEGIN` → delete interview-scoped `entity_relationships`, `entity_mentions`, `interview_chunks`, `content_snippets` → insert replacements → update interview fields (`summary`, `sentiment`, `topics`, review flags) → `COMMIT`. On error, **`ROLLBACK`** preserves the previous `COMPLETED` state.
- LLM calls stay **outside** the transaction; only the DB replace is transactional.

### 4. Structured seed table

Use **`interview_review_entities`** (relational) for auditability, querying, and future fields (e.g. evidence spans). Avoid storing the seed list only as unstructured JSON on `interviews`.

---

## User flow (target)

1. Interview reaches **`COMPLETED`** from the automatic pipeline (MVP: unchanged upload experience).
2. Editor opens **Transcript review** (dedicated route or tab from interview detail).
3. UI loads or initializes `reviewed_utterances` from the AssemblyAI-shaped utterances (copy-on-first-open).
4. Editor fixes utterance text, manages **seed entities** (search existing + create new) stored in `interview_review_entities`.
5. Editor clicks **Reprocess from review** → server validates editor role → runs reviewed pipeline → transactional swap.
6. Interview detail, search, chat, and network reflect the **reviewed** chunks and graph.

---

## MVP vs later

| MVP | Later |
|-----|--------|
| Post-`COMPLETED` review + reprocess | Pause pipeline at **pending review** before first extraction |
| Utterance-level text edit | Merge/split utterances; rich diff raw vs reviewed |
| Seed list without precise spans | `evidence_span` on seed rows + highlight in viewer |
| Single-user draft | Optimistic locking / audit log |

---

## Related docs

- [Ingestion pipeline — Human review layer](../architecture/ingestion-pipeline.md#human-review-layer--reviewed-reprocessing)
- [Database schema — `interviews` review columns & `interview_review_entities`](../infrastructure/database-schema.md)
- [Human-in-the-Loop — Entity Editor](./human-in-the-loop.md) (rename/merge after the fact; alias learning)

---

## File reference (implementation status)

| Piece | Path |
|-------|------|
| Migration | `supabase/migrations/00013_interview_transcript_review.sql` |
| Types | `src/types/database.ts` (`ReviewedUtterance`, `TranscriptReviewStatus`, `interview_review_entities`, RPC `clear_interview_derived_data`) |
| Shared intel path + reviewed reprocess | `src/lib/ai/pipeline.ts` — `runIntelPipelineFromTranscriptInput` (internal), `reprocessInterviewFromReview`, `processTranscription` |
| Extraction seeds | `src/lib/ai/extraction.ts` — `reviewerSeedEntities` |
| Forced entity resolution | `src/lib/entities/resolve.ts` — `RawExtractedEntity.forcedEntityId` |
| Review UI + save draft + seeds | `src/app/(dashboard)/interviews/[id]/review/page.tsx`, `src/components/interviews/transcript-review-editor.tsx` |
| Entity search API | `src/app/api/projects/[projectId]/entities/search/route.ts` |
| Server actions | `src/app/actions/interview-review.ts` |
| Parse `transcript_full` → initial utterances | `src/lib/interviews/transcript-utterances-from-full.ts` |
| Reprocess API + UI button | `POST /api/interviews/[id]/reprocess-review`, `TranscriptReviewEditor` “Run reprocessing” |

**UX note:** Unsaved transcript edits are kept in the browser when you add/remove seed entities (we do not reset local utterance state on every server refresh). A full page reload or navigating away and back loads the last **saved** draft from the database.

**Completion UX:** The final `COMPLETED` database update for a human-review run includes `transcript_review_status: draft` in the **same** write as `last_intel_source: human_review`, so Realtime / polling never leave the UI stuck on “reprocessing”. The transcript review page’s status tracker then redirects to the interview detail route when the pipeline hits `COMPLETED`. The interview header shows a **Human-reviewed intel** badge when `last_intel_source === human_review`.
