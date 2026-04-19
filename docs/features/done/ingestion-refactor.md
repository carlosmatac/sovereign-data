---
title: Ingestion Architecture Refactor
status: done
last_updated: 2026-04-12
---

# Ingestion Architecture Refactor

## Overview

Five-PR refactor that unifies the audio and PDF ingestion pipelines under a single shared runner, introduces `text` as a first-class source type, adds semantic source classification to the database, and feeds known project entities as context to the AI extractor.

---

## Changes shipped

### PR1 — Unified runner

- Renamed `runIntelPipelineFromTranscriptInput` → `runIntelPipelineFromCanonicalSource` (now exported).
- `document-pipeline.ts` reduced to a thin ~80-line wrapper that handles PDF-specific pre-processing and delegates everything to the shared runner.
- Smoke tests: `src/__tests__/pipeline-smoke.test.ts` (audio + PDF + reprocess + text paths all green).

### PR2 — DB + types

- Migration `00022_semantic_source_type.sql`: adds `semantic_source_type TEXT` and `source_metadata JSONB` to `interviews`; adds `'text'` to `source_type` enum; backfills existing rows with `semantic_source_type = 'interview'`.
- `src/types/database.ts`: updated to include new columns and `'text'` SourceType.
- `src/lib/constants.ts`: new `SEMANTIC_SOURCE_TYPES` constant.
- Audio insert now sets `semantic_source_type = 'interview'`.
- PDF insert accepts optional `semantic_source_type` form field (default `'interview'`).

### PR3 — text_interview end-to-end

- `src/lib/ai/chunking-text-interview.ts`: `chunkTextInterview(text, structureHint?)` with auto-detection of `qa_structured`, `speaker_transcript`, `article_style`, `freeform`.
- `src/lib/ai/source-adapters.ts`: `CanonicalSourceInput` interface.
- `src/app/api/interviews/from-text/route.ts`: `POST /api/interviews/from-text` — accepts JSON with `title`, `project_id`, `text` (100–200k chars), optional `structure_hint`, interviewee anchors.
- `src/lib/ai/document-pipeline.ts`: `processTextInterview()` added alongside `processDocument()`.
- Upload page: third tab "Texto" with textarea, `.txt` file loader, `structureHint` selector.
- Pipeline's chunking selector updated from binary to ternary: utterances → `chunkTranscript`, `source_type='text'` → `chunkTextInterview`, else → `chunkPlainText`.

### PR4 — Source-aware extraction + candidate entities

- `extractIntelligence` now accepts `sourceType`, `semanticSourceType`, and `candidateEntities`.
- Source-type overlay prompts applied based on `source_type + semantic_source_type` combination.
- `fetchCandidateEntities()` builds a shortlist (up to 30) of known project entities: anchor entities first, then most-mentioned, with global fallback for projects with <5 own entities; up to 2 aliases per entity.
- Prompt base for `audio + interview` is unchanged — no regression risk.

### PR5 — UI PDF classification + tests

- Upload page: when `sourceType === 'document'`, shows a "Document type" selector (Interview Transcript / Report / Published Article / Other). Value passed as `semantic_source_type` in FormData.
- `src/__tests__/chunking-text-interview.test.ts`: 16 tests for `chunkTextInterview` and `detectTextStructure`.
- Smoke tests extended to 4 paths (added `processTextInterview`).

---

## Key files

| File | Role |
|------|------|
| `src/lib/ai/pipeline.ts` | Shared runner + `fetchCandidateEntities` |
| `src/lib/ai/document-pipeline.ts` | Thin wrappers for PDF + text |
| `src/lib/ai/extraction.ts` | Source-aware extraction |
| `src/lib/ai/chunking-text-interview.ts` | Text structure detection + chunking |
| `src/lib/ai/source-adapters.ts` | `CanonicalSourceInput` type |
| `src/app/api/interviews/from-text/route.ts` | Text ingest endpoint |
| `supabase/migrations/00022_semantic_source_type.sql` | DB changes |
| `src/__tests__/pipeline-smoke.test.ts` | 4-path smoke tests |
| `src/__tests__/chunking-text-interview.test.ts` | 16 chunking unit tests |

---

## Acceptance criteria (all met)

- [ x ] No reference to `runIntelPipelineFromTranscriptInput` in codebase
- [ x ] `document-pipeline.ts` ≤ 80 lines (actual: ~90 with `processTextInterview`)
- [ x ] Smoke tests: 4 paths green
- [ x ] Chunking tests: 16 tests green
- [ x ] `tsc --noEmit` clean
- [ x ] Audio path unchanged
- [ x ] PDF path still works with `semantic_source_type` default `'interview'`
- [ x ] `POST /api/interviews/from-text` endpoint exists and validates
- [ x ] UI shows third tab and PDF type selector
- [ x ] Migration 00022 correct (no BEGIN/COMMIT wrapping `ALTER TYPE ... ADD VALUE`)

---

## Deferred

- OCR for scanned PDFs
- `internal_note` as a fully-wired source
- `video` source type

## Follow-ups shipped

- Review UI for `text` and `document` sources (no AssemblyAI utterances) — see [interview-transcript-review.md](./interview-transcript-review.md). The transcript review page now renders editable Q/A, speaker, and paragraph utterances from `transcript_full` using `parseTextInterviewToUtterances`, mirroring the structure detection in `chunkTextInterview`. Reprocess flow is unchanged: `reviewed_utterances` continues to feed the shared runner via `reprocessInterviewFromReview`.
