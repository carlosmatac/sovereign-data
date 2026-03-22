# Cursor agents — working in this repo

For **AI coding agents** (e.g. Cursor) and anyone delegating work. Defines **read order**, **truth sources**, **feature lifecycle**, and **documentation duty**.

---

## 1. Read this first (order matters)

1. **`AGENTS.md`** (this file)  
2. **`HANDOVER.md`** — business context, **critical gotchas**, stack, env, sacred patterns  
3. **`docs/roadmaps/active-workstreams.md`** — thin snapshot of “where work lives” (not per-feature detail)  
4. **The feature spec** — if the task is a feature: the relevant file in `docs/features/on-going/` or `to-do/` (human points you to it)  
5. **Topic docs** — only what you need: `docs/architecture/*`, `docs/infrastructure/*`, and **`docs/features/done/*`** for *reference* on shipped behavior  

Do **not** treat **`docs/roadmaps/phased-delivery-history.md`** or **`docs/roadmaps/intelligence-commercial-copilot.md`** as the task list. They are **legacy / planning**. If they conflict with `HANDOVER.md` or `active-workstreams.md`, **prefer the latter** and say so in your summary.

---

## 2. Single sources of truth (by topic)

| Topic | Authoritative place |
|-------|---------------------|
| Project overview & doc map | [`README.md`](./README.md) |
| Local setup | [`SETUP.md`](./SETUP.md) |
| Continuity + gotchas + env | [`HANDOVER.md`](./HANDOVER.md) |
| **Execution snapshot** (short) | [`docs/roadmaps/active-workstreams.md`](./docs/roadmaps/active-workstreams.md) |
| **Per-feature spec** (how/what for that feature) | [`docs/features/on-going/`](./docs/features/on-going/) or [`to-do/`](./docs/features/to-do/) while building; [`done/`](./docs/features/done/) when shipped |
| Feature lifecycle rules | [`docs/features/README.md`](./docs/features/README.md) |
| **Feature spec template** | [`docs/features/feature-spec-template.md`](./docs/features/feature-spec-template.md) |
| Agent workflow | **`AGENTS.md`** (this file) |
| System design (pipelines, chat, schema) | `docs/architecture/*`, `docs/infrastructure/*` |
| Historical phased delivery | [`phased-delivery-history.md`](./docs/roadmaps/phased-delivery-history.md) *(legacy)* |
| Long-form product plan | [`intelligence-commercial-copilot.md`](./docs/roadmaps/intelligence-commercial-copilot.md) *(planning)* |

**Rule:** one authoritative place per topic. Do not paste the same long specification into `HANDOVER.md`, `active-workstreams.md`, and a feature doc — **link** the feature doc instead.

---

## 3. Feature lifecycle (how work should flow)

1. Spec lives in **`docs/features/to-do/`** until someone starts implementation.  
2. Move it to **`on-going/`** and set frontmatter `status: on-going` when coding begins.  
3. **You (the agent)** update **that feature doc** as you implement: scope changes, key files, migrations, how to test, open questions.  
4. When the human confirms the feature is validated, **they** (or you, if asked) move the doc to **`done/`** and set `status: done`, `last_updated: YYYY-MM-DD`.  
5. Add a one-line entry to [`docs/features/done/README.md`](./docs/features/done/README.md) if it is a new file.

If no feature doc exists for the task, **propose** creating one in `to-do/` with the standard frontmatter from [`docs/features/README.md`](./docs/features/README.md) instead of dumping the plan only into chat.

---

## 4. Documentation is part of implementation

- **During** a task: keep the feature spec and any affected architecture doc **in sync** with behavior (same PR / same change set when possible).  
- **After** behavior changes: if there is no feature doc, add or extend the relevant **`docs/architecture/`** or **`docs/features/done/`** file — do not leave docs knowingly false.  
- **Do not** bloat `active-workstreams.md` with feature detail — update the **feature file** and only touch `active-workstreams` for high-level pointers if the human asks.

---

## 5. Sacred constraints (from `HANDOVER.md`)

- **Admin client pattern** after `getUser()` for mutations (`auth.uid()` is NULL in PostgREST context)  
- **`token_hash` magic link flow** — do not switch to PKCE as a casual fix  
- **SECURITY DEFINER RLS helpers** — do not replace with naive recursive policies  

If a task seems to require breaking these, **stop and ask** (or document a proposal for human review).

---

## 6. How to work — small phases

- **Smallest** change that satisfies the ask; no drive-by refactors.  
- Prefer **explainable chunks** over one opaque mega-diff.  
- At stop points: **files touched**, **how to test**, **doc files updated**.  
- **Uncertainty:** state it; do not invent priorities.

---

## 7. Reporting changes

Report: branch (if any), files created/moved/deleted, behavioral impact, test steps, and **which markdown files you updated**.

---

## 8. Git / branching — flexible convention

**The developer decides.** There is **no** repo rule that every task must use a new branch.

- **Larger / risky** (migrations, auth, RLS, broad refactors): branch + PR is usually safer.  
- **Small / low-risk:** direct commit on `main` may be fine if the team agrees.  
- **When unsure:** use a branch.

Agents follow **explicit user instructions**; do not insist on branch-per-task.

---

## 9. Bootstrap prompt (adapt)

```
Read AGENTS.md, HANDOVER.md, docs/roadmaps/active-workstreams.md.
Then read the feature spec I point to under docs/features/on-going/ or to-do/.
If I ask you to write a new feature spec, structure it from docs/features/feature-spec-template.md.

For system design, read only the linked docs/architecture or docs/infrastructure files.

Update the feature doc and relevant docs as you implement. Do not leave docs behind the code.

CRITICAL: Do NOT break admin client pattern, token_hash auth, or SECURITY DEFINER RLS helpers.
Do NOT treat phased-delivery-history or intelligence-commercial-copilot as the current task list unless I say so.
```

---

## Related

- [`docs/workflows/README.md`](./docs/workflows/README.md)  
- [`docs/features/README.md`](./docs/features/README.md)  
