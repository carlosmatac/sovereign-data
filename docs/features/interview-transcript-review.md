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
| **Auto display** | `interviews.transcript_display` | Deterministic anchor normalization for reading (`normalizeTranscriptDisplay`). Not the reviewed artifact. |
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

## File reference (as implemented)

_To be filled during Phase 3.6 implementation: migration `00013_interview_transcript_review.sql`, `src/lib/ai/pipeline.ts`, review UI routes, reprocess API._
