> **This file is the canonical template only.**  
> To start a feature: **copy this entire file** into [`to-do/`](./to-do/) or [`on-going/`](./on-going/), rename to something like `short-feature-slug.md`, remove this callout box, then replace placeholders.  
> **Agents:** when asked to write a feature spec, follow this structure. Sections may be **merged, shortened, or omitted** if irrelevant, but keep **YAML frontmatter**, **Problem**, **Approach**, and **Acceptance** in some form.

---

```yaml
---
title: "<Short feature name>"
status: to-do
owner: team
priority: medium
last_updated: YYYY-MM-DD
related_architecture: []
related_infrastructure: []
---
```

**Copy tip:** In the new file, the **first line** must be `---` (start of YAML frontmatter). Remove the markdown code fence around the YAML and delete this tip line; keep the `---` … `---` block and everything from `# Title` downward.

# Title (keep in sync with `title` in frontmatter)

## Problem

- What user or system pain does this address?
- What is broken, missing, or too costly today?
- Optional: link to ticket, conversation, or customer context.

## Goals

- Outcomes we want (prefer testable: when X, then Y).

## Non-goals

- What this iteration explicitly **will not** do (prevents scope creep).

## Approach

- **Strategy:** how we solve it — short narrative or numbered phases for incremental delivery.
- **Constraints:** align with [`HANDOVER.md`](../../HANDOVER.md) (e.g. admin client, `token_hash`, SECURITY DEFINER RLS helpers) and note perf/security/UX expectations.
- Optional: **Phase 1 / Phase 2** breakdown for agent-sized steps.

## User experience (optional)

- Flows, screens, roles (owner/editor/viewer), key copy. Link to designs if any.

## Technical notes (optional)

- Routes, APIs, tables, env vars, flags, background jobs.
- **Likely code paths** — update as implementation proceeds.

## Dependencies & related docs

- Other features or migrations.
- Link to `docs/architecture/*`, `docs/infrastructure/*`, `docs/features/done/*` instead of duplicating long system explanations.

## Risks & open questions

- Unknowns and decisions that need a human.

## Acceptance / how to validate

- Definition of done: manual steps, URLs, roles, or checklists.

## Implementation log (optional)

- Dated bullets as milestones land (helps the next agent or reviewer).
