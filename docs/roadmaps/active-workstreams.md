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

- **In progress:** [`admin-entity-governance-dashboard.md`](../features/on-going/admin-entity-governance-dashboard.md) — entity governance UI at `/admin/entities`.
- **In progress:** [`fix-context-entity-ingestion.md`](../features/on-going/fix-context-entity-ingestion.md) — strict source-grounded entity persistence (drop ungrounded mentions + contaminated relationships) across audio, document/PDF, and reviewed-text reprocess.
- **In progress:** [`editable-relationship-governance.md`](../features/on-going/editable-relationship-governance.md) — interview-scoped MVP for editing/rejecting LLM relationships; decisions survive reprocess (migration `00023`). **Phase 1.5 (2026-04-19):** rejected rows are now excluded from active graph / connections / chat / report views, and the `relation_type` enum gained `affiliated_with`, `operates_in`, `governs`, `customer_of` (migration `00024`).
- **In progress:** [`entity-type-expansion-v1.md`](../features/on-going/entity-type-expansion-v1.md) — focused flat `entity_type` expansion plus centralized type constants/helpers (migration `00025`).

---

## Immediate next

- **Derive from** product discussion and whatever sits in `to-do/` / `on-going/` — not from legacy phase tables.

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
