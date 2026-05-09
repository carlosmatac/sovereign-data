# Active workstreams — execution snapshot

> **Truth pair:** this file + [`HANDOVER.md`](../../HANDOVER.md) define **current execution context** (what matters now, constraints, env).  
> **Not** execution sources: [phased delivery history](./phased-delivery-history.md), [intelligence commercial copilot](./intelligence-commercial-copilot.md), or root [`ROADMAP.md`](../../ROADMAP.md).

This file stays **short**. Per-feature detail lives under [`docs/features/`](../features/README.md) (`to-do` / `on-going` / `done`). Do not grow this into a backlog of every idea.

---

## Where work lives

| Location | Use |
|----------|-----|
| [`docs/features/on-going/`](../features/on-going/) | Specs for **active** implementation |
| [`docs/features/to-do/`](../features/to-do/) | Queued / parked specs |
| [`docs/features/done/`](../features/done/) | Shipped reference docs |

---

## Right now

Right now, only focus on [`database-refactor-plan.md`](./database-refactor-plan.md).

**Refactor progress:**

- **Phase 0 (baseline)** — done. Audit baseline captured + cadence
  table opened in
  [`docs/features/on-going/database-retrieval-refactor-baseline.md`](../features/on-going/database-retrieval-refactor-baseline.md).
- **Phase 1 (entity-centered retrieval RPC)** — done (2026-05-06).
  Spec at
  [`docs/features/done/chat-entity-retrieval-rpc.md`](../features/done/chat-entity-retrieval-rpc.md);
  migration `supabase/migrations/00026_entity_intel_rpc.sql`.
- **Phase 2.1 (source-first rename + back-compat views)** — shipped
  (2026-05-06). Spec at
  [`docs/features/on-going/source-rename-and-backcompat-views.md`](../features/on-going/source-rename-and-backcompat-views.md);
  migration `supabase/migrations/00027_rename_interviews_to_sources.sql`
  applied to remote, app write paths moved to `sources` /
  `source_chunks`, browser smoke clean, committed.
- **Phase 2.2 (`source_entities` table + anchor backfill)** — shipped
  (2026-05-06). Spec at
  [`docs/features/on-going/source-entities-table-and-backfill.md`](../features/on-going/source-entities-table-and-backfill.md);
  migration `supabase/migrations/00028_source_entities_table.sql`
  applied to remote.
- **Phase 2.3 (pipeline writes `source_entities` + orphan-anchor
  reduction)** — shipped (2026-05-08). Spec at
  [`docs/features/on-going/source-entities-pipeline-writes.md`](../features/on-going/source-entities-pipeline-writes.md);
  migration `supabase/migrations/00029_clear_source_derived_extraction.sql`
  applied to remote. PR 2.3 also closes a regression in the upload
  flow: explicit `Primary person` / `Organization` form fields now
  deterministically match-or-create their entity at the route layer
  via `ensureUploadAnchorEntity`, populating
  `sources.interviewee_*_entity_id` and the matching
  `source_entities` upload-anchor row on every upload. Committed.
- **Phase 2.4 (`entity_intel` reads `source_entities`)** — shipped
  (2026-05-08). Spec at
  [`docs/features/on-going/entity-intel-rpc-source-entities.md`](../features/on-going/entity-intel-rpc-source-entities.md);
  migration `supabase/migrations/00030_entity_intel_rpc_v2.sql` applied
  to remote. Smoke test confirmed: Martín Eurnekian and Corporación
  América Airports correctly linked to "test 2.3" via
  `source_entities` (`interviewee` / `interviewee_org`). Committed.

---

## Tracked product fixes (queued, do not auto-start)

These came out of Phase 1 manual chat testing (2026-05-06). They are
**not refactor phases**; they are scoped product/data-quality fixes
that should not get lost behind the phased work:

- [`docs/features/to-do/entity-cross-type-deduplication.md`](../features/to-do/entity-cross-type-deduplication.md)
  — same-name / different-type canonical duplicates
  (`One World Media`, `Banco Angolano de Investimentos`, …) +
  audit-probe gap (§12.10b).
- [`docs/features/to-do/entity-correction-governance.md`](../features/to-do/entity-correction-governance.md)
  — reviewer corrections must repoint mentions / relationships /
  aliases instead of leaving stale canonical rows behind.
- [`docs/features/to-do/entity-metadata-and-descriptions.md`](../features/to-do/entity-metadata-and-descriptions.md)
  — `entities.metadata` is empty for all 56 canonical entities;
  descriptions are 100-char-capped and underperform as standalone
  evidence.
- [`docs/features/to-do/chat-citation-routing.md`](../features/to-do/chat-citation-routing.md)
  — server-side sanitizer for citation links; the LLM occasionally
  fabricates `https://example.com/...` despite the prompt rule.
- [`docs/features/to-do/entity-anchor-autocomplete-ux.md`](../features/to-do/entity-anchor-autocomplete-ux.md)
  — `Primary person` / `Organization` autocomplete already exists
  but is not discoverable; needs loading state, project-vs-global
  badges, and a "no match — will create" hint. Pure UX follow-up
  to the PR 2.3 regression fix (functional behaviour is correct).
- [`docs/features/to-do/source-detail-entity-cards.md`](../features/to-do/source-detail-entity-cards.md)
  — surface the source-level primary entities (`interviewee`,
  `interviewee_org` rows in `source_entities`) at the top of the
  source detail page. Backend is in place (PR 2.3); pure frontend.
- [`docs/features/to-do/anchor-row-context-enrichment.md`](../features/to-do/anchor-row-context-enrichment.md)
  — when `entity_intel` returns a source-level anchor row
  (`role='interviewee'`, etc.), the Copilot should surface the
  source summary, representative chunk, or metadata instead of "no
  transcript excerpt available." Non-blocking follow-up to Phase 2.4.

---

## Immediate next

- **Refactor:** Phase 2.5 — done (2026-05-08). `entities.UNIQUE(name, type)`
  global constraint dropped; project-scoped unique index in place; `23505`
  recovery hack removed from `match.ts`. Spec at
  [`docs/features/on-going/schema-doc-and-types-refresh.md`](../features/on-going/schema-doc-and-types-refresh.md).

- **Phase 3a — shipped (2026-05-08).** Three migrations applied to
  remote; all 161 tests passing. `tenant_id` propagated through every
  write path; RLS active on all 19 tables.
  Feature spec: [`docs/features/on-going/tenants-rls-and-customization.md`](../features/on-going/tenants-rls-and-customization.md).
  ADR: [`docs/architecture/tenant-model-adr.md`](../architecture/tenant-model-adr.md).

- **Phase 3b — smoke tested (2026-05-09).** Reviewed-reprocess transactional
  swap. Migrations 00035–00038 applied to remote; all tests passing.
  Three post-deployment incidents diagnosed and fixed (duplicate FKs from 3a,
  `vector` type search_path, JSONB double-serialisation). Smoke reprocess confirmed.
  Feature spec + postmortem: [`docs/features/on-going/reprocess-transactional-swap.md`](../features/on-going/reprocess-transactional-swap.md).
  **Known debt:** `interviews` back-compat view still used by 28 files (TD-1 in spec).

- **Phase 4a — shipped (2026-05-09).** Persisted chat message evidence.
  Migration 00039 applied to remote; `chat_message_evidence` table live with
  compound FK to `chat_messages(id, tenant_id)` and RLS. Evidence rows written
  in `onFinish`; evidence loaded with messages on thread reload; citation chips
  rendered below assistant responses.
  Feature spec: [`docs/features/on-going/chat-message-evidence.md`](../features/on-going/chat-message-evidence.md).

- **Backlog:** the queued specs above, in priority order set
  by the human reviewer.

---

## Explicitly not current execution (do not auto-start)

- **Production deployment** (Vercel, prod domains, prod webhooks, etc.) — **not** prioritized here; when the team decides to ship, use the checklist in [`HANDOVER.md`](../../HANDOVER.md) §4 and a **dedicated feature doc** in `to-do/` → `on-going/` if you want it tracked like other work.
- Replacing **admin client**, **`token_hash` auth**, or **SECURITY DEFINER RLS** patterns — see `HANDOVER.md` (sacred unless explicit architecture change).

---

## Later / parked

- Themes from [intelligence commercial copilot](./intelligence-commercial-copilot.md) (retrieval, evidence-first chat, meeting-prep UX, hardening) — **planning reference**; reconcile with code and `docs/features/` before executing.

---

## Related

| Doc | Role |
|-----|------|
| [`AGENTS.md`](../../AGENTS.md) | Agent workflow + documentation duty |
| [`docs/features/README.md`](../features/README.md) | Feature lifecycle rules |
| [Phased delivery history](./phased-delivery-history.md) | Legacy |
| [Intelligence commercial copilot](./intelligence-commercial-copilot.md) | Planning / CEO-demo narrative |
