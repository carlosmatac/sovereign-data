---
title: Interview Transcript Review & Reviewed Reprocessing
status: done
owner: team
priority: high
last_updated: 2026-04-19
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

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
| Parse `transcript_full` → initial utterances | `src/lib/interviews/transcript-utterances-from-full.ts` (`parseTranscriptFullToUtterances` for AssemblyAI bracket transcripts; `parseTextInterviewToUtterances` for `source_type='text' \| 'document'`) |
| Reprocess API + UI button | `POST /api/interviews/[id]/reprocess-review`, `TranscriptReviewEditor` “Run reprocessing” |

### Text & document sources

`source_type='text'` and `source_type='document'` rows have no AssemblyAI `source_utterances` to seed the editor from. The review page falls back to **`parseTextInterviewToUtterances(transcript_full, structure_hint)`**, which mirrors the structure detection used by `chunkTextInterview`:

| Detected / hinted structure | Utterance shape | Speaker codes |
|-----------------------------|-----------------|---------------|
| `qa_structured` | One utterance per Q-line and per A-line (`Q:` / `Question:` / `Pregunta:` / `P:` and `A:` / `Answer:` / `Respuesta:` / `R:`). Blank line after a Q implicitly opens an A. | `Q` → "Question", `A` → "Answer" |
| `speaker_transcript` | One utterance per speaker turn (consecutive lines under the same `Name:` are merged). | `<speaker name>` (identity) |
| `article_style` / `freeform` | One utterance per blank-line-separated paragraph; single-line input → one utterance. | `P` → "Paragraph" |

Synthetic timestamps (`start = i`, `end = i + 1`) are emitted because text/document sources have no audio playback (`chunkAudioEnabled === false` in the editor) and the search rail uses character lengths, not time, for positioning. The parser-derived `speakerMap` is overlaid onto `interview.speaker_map` so the existing UI keeps working without branching on `source_type`. Tests: `src/__tests__/transcript-utterances-from-text.test.ts`.

Reprocess flow is unchanged: editing produces `reviewed_utterances` with these synthetic timestamps, and `reprocessInterviewFromReview` continues to call the shared `runIntelPipelineFromCanonicalSource` runner with `chunkUtterances` from the saved draft.

**UX note:** Unsaved transcript edits are kept in the browser when you add/remove seed entities (we do not reset local utterance state on every server refresh). A full page reload or navigating away and back loads the last **saved** draft from the database.

**Completion UX:** The final `COMPLETED` database update for a human-review run includes `transcript_review_status: draft` in the **same** write as `last_intel_source: human_review`, so Realtime / polling never leave the UI stuck on “reprocessing”. The transcript review page’s status tracker then redirects to the interview detail route when the pipeline hits `COMPLETED`. The interview header shows a **Human-reviewed intel** badge when `last_intel_source === human_review`.

---

## Display and chunk normalization fidelity guarantees

The reviewed reprocess flow flows through two normalization layers between
`reviewed_utterances` and what the user sees / what we embed:

1. `normalizeTranscriptDisplay()` — `src/lib/transcript/normalizeDisplay.ts`
   - Builds `transcript_display` for the reviewed run from
     `reviewed_utterances.map(u => u.text).join("\n")`.
2. `normalizeChunkWithAnchors()` — `src/lib/chunks/anchor-normalization.ts`
   - Builds the per-chunk `metadata.normalized_content` and
     `metadata.content_for_embedding`.

Both layers are **conservative-only**. They MUST NOT semantically rewrite
the human-reviewed text. Concretely:

- **No honorific-stripped / bare-surname variants.** A person anchor
  like `"Mrs. Brown"` does **not** generate `"Brown"` as a replaceable
  variant. (Earlier behavior produced `"Mr. Brown"` → `"Mr. Mrs. Brown"`
  whenever another person shared the surname.)
- **No proximity-based variant discovery in display normalization.** The
  display layer no longer scans an 80-char window around an anchor for
  acronyms, role-prefixed names, or org markers. (Earlier behavior
  caused `NNPC` to be rewritten to the interviewee org globally after
  it was spotted near the anchor a single time.)
- **Only safe, deterministic variants of the *full* canonical anchor
  are applied** — currently the punctuation/spacing-tidy form
  (e.g. `"Mrs Brown"` → `"Mrs. Brown"`, `"Dr Mohamed"` → `"Dr. Mohamed"`).
- **Anchor enrichment carries retrieval coverage**, not destructive
  substitution. `content_for_embedding` still appends
  `Primary interviewee: …` / `Primary institution: …` so partial
  mentions inside a chunk remain retrievable without rewriting the body.
- `reviewed_utterances` itself is never modified by these layers.

Tests (regression coverage):
- `src/__tests__/normalize-display.test.ts`
- `src/__tests__/anchor-normalization.test.ts`

**Known phase-2 limitations** (deliberately not in scope of this fix):
- The display layer still does no honorific-aware lookbehind; it relies
  entirely on *not generating* dangerous variants in the first place.
  If future variants are added, they must be evaluated for the same
  `Mr.` / `Mrs.` collision risk.
- The chunk layer still gates the surfaced `normalizedContent` on
  `confidence === "high"`, so a single-anchor interview falls back to
  raw chunk text in `normalizedContent` even when a safe variant
  matched. `contentForEmbedding` always benefits from the anchor
  enrichment lines.
