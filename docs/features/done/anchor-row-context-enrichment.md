---
title: "Anchor row context enrichment for entity_intel"
status: done
owner: unassigned
priority: medium
last_updated: 2026-05-17
related_features:
  - docs/features/on-going/entity-intel-rpc-source-entities.md
  - docs/features/done/chat-entity-retrieval-rpc.md
---

# Anchor row context enrichment for entity_intel

## Problem

When `entity_intel` returns a `source_entities` anchor row
(`role='interviewee'`, `role='interviewee_org'`, etc.) the chat
fallback context string is:

> "Anchor interviewee on this source — no transcript excerpt for this row."

This is technically correct — the anchor row has no chunk-level evidence
— but it is a poor user experience when the source has been fully
processed and contains transcript chunks, summaries, and entity mentions
that could answer the question better.

**Example:** after Phase 2.4 the chat correctly links Martín Eurnekian
to "test 2.3" as `role='interviewee'`, but responds with "no transcript
excerpt available" even though the source has processed content.

## Root cause

`entity_intel` branch 2 (source_entities) deliberately returns `NULL`
for `evidence` and `chunk_id`. The chat tool maps `chunk_content = null`
to a fixed fallback string rather than falling back to the source's
summary, representative chunks, or other `entity_mentions` rows.

## Desired behavior

When `lookupMentions` returns a source-entity anchor row where
`chunk_content` is null, the Copilot should augment the response with:

1. **Source summary** — `sources.summary` is a short LLM-generated
   summary of the source; this is the cheapest signal to add.
2. **Representative chunk** — if the entity has `entity_mentions` rows
   on the same source, pull the highest-relevance chunk as context.
3. **Source metadata** — `sources.title`, `sources.conducted_at`,
   `sources.semantic_source_type`, interviewee name fields.

## Options

### Option A — Enrich in the RPC (preferred)

Extend `entity_intel` to also return `sources.summary` in the
`evidence` column for anchor rows where `evidence` would otherwise be
null. Requires adding `sources.summary` to the SELECT and handling null
at the application layer. Low complexity.

### Option B — Secondary lookup in the chat tool

When `getMentions` returns anchor rows with `chunk_content = null`,
issue a secondary query for `entity_mentions` on the same source, and
pull the first non-null `context`. More round-trips, but avoids
changing the RPC signature.

### Option C — Hybrid: RPC returns summary, tool fetches chunks

RPC returns `sources.summary` for anchor rows. Chat tool additionally
fetches top-1 mention context if `kind='anchor'` and a richer response
is needed.

## Acceptance criteria

- [ ] Asking "have we interviewed X?" returns the source title + a
      brief context (summary, excerpt, or metadata) rather than "no
      transcript excerpt for this row."
- [ ] Existing `mention`-role rows (with real chunk content) are
      unaffected.
- [ ] No breaking change to the `entity_intel` return shape (additive
      only, or handled in the app layer).

## Notes

- This is non-blocking for Phase 2.4 and should not be bundled into
  Phase 2.5 (the unique-constraint swap). It deserves its own PR once
  the Phase 2 foundation is complete.
- Option A (RPC summary enrichment) is the lowest-risk starting point.
