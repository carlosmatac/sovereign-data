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
- **Phase 2.1** — next on deck per the plan.

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

---

## Immediate next

- **Refactor:** Phase 2.1 of
  [`database-refactor-plan.md`](./database-refactor-plan.md).
- **Backlog:** the four queued specs above, in priority order set
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
