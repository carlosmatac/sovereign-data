# Features — to-do

Place **new or parked** feature specs here (`status: to-do` in frontmatter).

Start from **[`../feature-spec-template.md`](../feature-spec-template.md)** (copy → rename → remove callout → fill in).

When work starts, move the file to [`../on-going/`](../on-going/) and update frontmatter.

See [`../README.md`](../README.md) for the full lifecycle.

---

## Specs in this folder

| Doc | Priority | Summary |
|-----|----------|---------|
| [`private-storage-for-assemblyai.md`](./private-storage-for-assemblyai.md) | **critical** | Move source audio files from a public Supabase bucket to a private one; generate signed URLs for AssemblyAI and audio playback. |
| [`dashboard-project-scoped-stats.md`](./dashboard-project-scoped-stats.md) | **high** | Bug fix — dashboard shows global aggregate counts instead of per-user project-scoped counts; non-member users can reach 404 detail pages via dashboard links. |
| [`reprocess-ux-overhaul.md`](./reprocess-ux-overhaul.md) | **high** | Collapse the 3-step reprocess flow to one "Save & Reprocess" action; add live status polling, in-progress guard, and a recoverable failure state. |
| [`entity-anchor-autocomplete-ux.md`](./entity-anchor-autocomplete-ux.md) | medium | Fix entity autocomplete in the Add Source form: address response latency (>500ms) and add visual feedback states (loading, no-match, project-vs-global badge, linked-entity chip). |
| [`entity-metadata-and-descriptions.md`](./entity-metadata-and-descriptions.md) | medium | Richer entity descriptions and structured `metadata` JSONB; offline backfill; pipeline integration; progressive description reinforcement as mention counts grow. |
| [`source-entity-relationship-context.md`](./source-entity-relationship-context.md) | medium | Add a `context` text field to `source_entities` describing how/why a specific entity relates to a specific source; surface in `entity_intel` RPC and Copilot prompts. |
| [`source-all-related-entities-panel.md`](./source-all-related-entities-panel.md) | medium | Source detail page "Entities" panel shows all `source_entities` rows (anchors + extracted), not only literal `entity_mentions`; labels roles (Interviewee, Extracted, etc.). |
| [`transcript-review-entity-panel-sidebar.md`](./transcript-review-entity-panel-sidebar.md) | medium | Move the entity correction panel to a sticky right sidebar on the transcript review page; show the full pre-existing entity list at the top of the sidebar. |
| [`chat-source-citation-cards.md`](./chat-source-citation-cards.md) | medium | Replace plain citation chips in Copilot responses with rich source cards: type badge (Interview/Document/Note), primary entity, hover excerpt, "Cited" vs. supporting-context visual distinction. |
| [`project-entity-linking.md`](./project-entity-linking.md) | medium | New `project_entities` join table for direct many-to-many project ↔ entity links, independent of the source chain; user-managed with an optional note field. |
| [`multi-participant-source-entities.md`](./multi-participant-source-entities.md) | medium | Add a dynamic participant list to the Add Source form so users can pre-tag multiple known entities before upload; each becomes a `source_entities` anchor row. |
| [`dark-light-mode-toggle.md`](./dark-light-mode-toggle.md) | low | Build a light mode theme and add a per-user dark/light/system toggle; remove `forcedTheme: "dark"`. |
| [`users-as-entities.md`](./users-as-entities.md) | low | Link platform user profiles to `entities` rows; inject user identity into the Copilot system prompt for personalized answers. |
| [`source-detail-entity-cards.md`](./source-detail-entity-cards.md) | medium | Source detail page top-of-page cards for the primary anchor entities (interviewee + org). |
| [`entity-correction-governance.md`](./entity-correction-governance.md) | medium | Entity correction and governance workflows. |
| [`entity-cross-type-deduplication.md`](./entity-cross-type-deduplication.md) | medium | Detect and resolve entities that exist with the same name but different types. |
| [`anchor-row-context-enrichment.md`](./anchor-row-context-enrichment.md) | medium | Backfill interviewee FK columns on existing sources to activate the Phase 1 anchor branch. |
| [`chat-citation-routing.md`](./chat-citation-routing.md) | medium | Click-through routing from chat citation markers `[1]` to the specific source/chunk. |
| [`remove-tavily-web-search.md`](./remove-tavily-web-search.md) | medium | Remove the Tavily `searchWeb` tool from the Copilot — Aksum is internal knowledge only; web search dilutes answer trustworthiness. |

---

### Ideas covered by existing specs (no new spec needed)

| Developer idea | Covered by |
|----------------|-----------|
| Slow autocomplete during upload | `entity-anchor-autocomplete-ux.md` (now includes performance as a goal) |
| Entity descriptions reinforced as more sources mention them | `entity-metadata-and-descriptions.md` (added to Risks & open questions) |
