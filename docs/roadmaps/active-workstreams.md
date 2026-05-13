# Active workstreams — execution snapshot

> **Truth pair:** this file + [`HANDOVER.md`](../../HANDOVER.md) define **current execution context** (what matters now, constraints, env).  
> **Not** execution sources: [phased delivery history](./done/phased-delivery-history.md), [intelligence commercial copilot](./done/intelligence-commercial-copilot.md).

This file stays **short**. Per-feature detail lives under [`docs/features/`](../features/README.md) (`to-do` / `on-going` / `done`). Do not grow this into a backlog of every idea.

---

## Where work lives

| Location | Use |
|----------|-----|
| [`docs/features/on-going/`](../features/on-going/) | Specs for **active** implementation |
| [`docs/features/to-do/`](../features/to-do/) | Queued / parked specs |
| [`docs/features/done/`](../features/done/) | Shipped reference docs |

---

## Current status

**The database refactor (Phases 0 – 4b) is complete as of 2026-05-10.**

All refactor feature specs have been moved to [`docs/features/done/`](../features/done/). The `on-going/` folder is empty.

The full implementation history lives in [`docs/roadmaps/done/database-refactor-plan.md`](./done/database-refactor-plan.md).

---

## Right now

The active backlog is the 14 queued specs in [`docs/features/to-do/`](../features/to-do/).

The ordering and rationale are in **[`docs/roadmaps/backlog-phased-plan.md`](./backlog-phased-plan.md)**.

Short summary:

| Phase | Theme | Specs |
|-------|-------|-------|
| **0** | Security / correctness | private storage, dashboard scoping bug, remove Tavily |
| **1** | Operational UX | reprocess UX, autocomplete, transcript sidebar |
| **2** | Knowledge model | entity metadata, source-entity context, related-entities panel, multi-participant, project-entity linking |
| **3** | Copilot presentation | chat source citation cards |
| **4** | Polish / later architecture | dark mode, users as entities |

Start with Phase 0. Pick up Phase 1 immediately after.

---

## Explicitly not current execution (do not auto-start)

- **Production deployment** (Vercel, prod domains, prod webhooks, etc.) — **not** prioritized here; when the team decides to ship, use the checklist in [`HANDOVER.md`](../../HANDOVER.md) §4 and a **dedicated feature doc** in `to-do/` → `on-going/` if you want it tracked like other work.
- Replacing **admin client**, **`token_hash` auth**, or **SECURITY DEFINER RLS** patterns — see `HANDOVER.md` (sacred unless explicit architecture change).

---

## Related

| Doc | Role |
|-----|------|
| [`AGENTS.md`](../../AGENTS.md) | Agent workflow + documentation duty |
| [`docs/features/README.md`](../features/README.md) | Feature lifecycle rules |
| [`docs/roadmaps/backlog-phased-plan.md`](./backlog-phased-plan.md) | Phased ordering of the current backlog |
| [`docs/roadmaps/done/phased-delivery-history.md`](./done/phased-delivery-history.md) | Legacy delivery history |
| [`docs/roadmaps/done/intelligence-commercial-copilot.md`](./done/intelligence-commercial-copilot.md) | Planning / CEO-demo narrative (archived) |
