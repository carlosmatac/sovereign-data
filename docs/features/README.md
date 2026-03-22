# Features — lifecycle and specs

Meaningful product work is tracked as **markdown specs** under `docs/features/`, organized by delivery state. This keeps **one authoritative doc per feature** and avoids duplicating long descriptions in `HANDOVER.md` or `active-workstreams.md`.

---

## Directories

| Path | Meaning |
|------|---------|
| [`to-do/`](./to-do/) | Spec exists; **not started** or parked. |
| [`on-going/`](./on-going/) | **Active development** — this is what engineers and agents should be implementing. |
| [`done/`](./done/) | Shipped and validated; **reference** for behavior and history. |

---

## Feature spec template

**New or updated specs** should follow **[`feature-spec-template.md`](./feature-spec-template.md)** — flexible sections (Problem, Goals, Approach, Acceptance, …) plus YAML frontmatter. Copy that file into `to-do/` or `on-going/`, rename, remove the callout, unwrap frontmatter (see template instructions), and fill in.

**Cursor agents:** if asked to **write a feature document**, use [`feature-spec-template.md`](./feature-spec-template.md) as the default structure unless the human specifies otherwise.

**One doc = one feature.** Link to architecture/infra docs instead of pasting duplicate pipeline explanations.

---

## Human + Cursor workflow

1. **Author** a spec in `to-do/` by copying [`feature-spec-template.md`](./feature-spec-template.md) (or move an idea from chat into a new file using that structure).  
2. **Update** [`HANDOVER.md`](../../HANDOVER.md) only if continuity or gotchas change — not for full feature prose (link the feature doc instead).  
3. **Start work:** move the file to `on-going/` and set `status: on-going` in frontmatter.  
4. **Brief the agent** with: [`AGENTS.md`](../../AGENTS.md) → `HANDOVER.md` → this feature doc → narrow `docs/architecture` / `docs/infrastructure` files.  
5. **While implementing:** the agent **updates the same feature doc** (scope, decisions, file paths, how to test) — documentation is part of the task, not an afterthought.  
6. **When validated:** move the file to `done/`, set `status: done`, bump `last_updated`.

[`docs/roadmaps/active-workstreams.md`](../roadmaps/active-workstreams.md) stays **short**: it points at these folders and names **at most** a few active themes — it does not replace per-feature docs.

---

## Shipped features (index)

See [`done/README.md`](./done/README.md) for links to completed specs.

---

## Related

- [`AGENTS.md`](../../AGENTS.md) — agent read order, doc updates, branching guidance  
- [`HANDOVER.md`](../../HANDOVER.md) — continuity and constraints  
- [`active-workstreams.md`](../roadmaps/active-workstreams.md) — thin execution snapshot  
- [`docs/README.md`](../README.md) — full `docs/` index  
