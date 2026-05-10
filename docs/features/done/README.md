# Features — done (reference)

Shipped feature documentation. **Do not treat these as a task list** — they describe what already exists.

| Document | Topic |
|----------|--------|
| [human-in-the-loop.md](./human-in-the-loop.md) | Entity Editor, merges, alias learning |
| [interview-transcript-review.md](./interview-transcript-review.md) | Reviewed utterances, seeds, reprocessing |
| [report-generation.md](./report-generation.md) | Reports, PDF, sharing |
| [interview-ui-visibility.md](./interview-ui-visibility.md) | Demo toggles / interview UI flags |
| [dashboard-sidebar-and-speaker-names.md](./dashboard-sidebar-and-speaker-names.md) | Sidebar, branding, `speaker_map` |
| [time-aware-validated-positions-rag.md](./time-aware-validated-positions-rag.md) | `validated_positions`, chat time-aware, `lookupPositions`, API títulos |
| [platform-user-roles-authorization.md](./platform-user-roles-authorization.md) | Global roles (`member` / `platform_admin` / `superuser`), Platform Administration routing |
| [platform-user-role-management.md](./platform-user-role-management.md) | `/admin/users` — superuser grants `platform_admin` / `superuser` |

| [edit-interview-title.md](./edit-interview-title.md) | Inline rename of interview title from detail page |

| [ingestion-refactor.md](./ingestion-refactor.md) | Unified ingestion pipeline, text source type, semantic classification, candidate entities |
| [chat-entity-retrieval-rpc.md](./chat-entity-retrieval-rpc.md) | Phase 1 of database refactor — `entity_intel` SECURITY DEFINER RPC + `lookupMentions` rewrite (interviewee / interviewee-org / mention / relationship branches) |
| [source-rename-and-backcompat-views.md](./source-rename-and-backcompat-views.md) | Phase 2.1 — `interviews` → `sources`, `interview_chunks` → `source_chunks` (in-place rename + back-compat views) |
| [source-entities-table-and-backfill.md](./source-entities-table-and-backfill.md) | Phase 2.2 — `source_entities` table + `link_type`/`origin` enums + anchor backfill (migration 00028) |
| [source-entities-pipeline-writes.md](./source-entities-pipeline-writes.md) | Phase 2.3 — pipeline writes `source_entities` for anchors + extracted associations; `match_only` resolver mode stops orphan entity creation |
| [entity-intel-rpc-source-entities.md](./entity-intel-rpc-source-entities.md) | Phase 2.4 — `entity_intel` RPC reads `source_entities` instead of legacy FK columns; all `link_type` roles surfaced |
| [entities-unique-constraint-swap.md](./entities-unique-constraint-swap.md) | Phase 2.5 — drop global `UNIQUE(name,type)` on `entities`; add project-scoped unique index; remove 23505 silent-recovery hack |

New completed features: add a row here when you move a spec into this folder.
| [database-retrieval-refactor-baseline.md](./database-retrieval-refactor-baseline.md) | Phase 0 — baseline diagnostics (read-only audit script + 16 SQL queries against live DB before refactor) |
| [schema-doc-and-types-refresh.md](./schema-doc-and-types-refresh.md) | Phase 2.6 — full rewrite of database-schema.md + `database.ts` Views / entity_intel types to match post-Phase-2.5 schema |
| [tenants-rls-and-customization.md](./tenants-rls-and-customization.md) | Phase 3a — `tenants` table, `tenant_id` on every customer-owned table, compound FKs, RLS via `is_tenant_member()` |
| [reprocess-transactional-swap.md](./reprocess-transactional-swap.md) | Phase 3b — `replace_source_derived_data` SECURITY DEFINER function; atomic clear+insert; three post-deploy incident postmortems |
| [chat-message-evidence.md](./chat-message-evidence.md) | Phase 4a — `chat_message_evidence` table; write RAG chunk citations on every assistant turn; read + render evidence chips in chat UI |
| [topics-as-entities.md](./topics-as-entities.md) | Phase 4b — TOPIC/RISK/OPPORTUNITY/PROJECT added to `entity_type` enum; extraction pipeline emits thematic entities alongside existing string-tag arrays |
| [dashboard-project-scoped-stats.md](./dashboard-project-scoped-stats.md) | Phase 0 security — dashboard and knowledge list scoped to user's project memberships; non-member detail/review pages return 404 |
| [private-storage-for-assemblyai.md](./private-storage-for-assemblyai.md) | Phase 0 security — audio uploads use a private Supabase bucket; signed URLs generated on-demand for AssemblyAI and the audio player; poll hardened with 30-second AbortController timeout |
| [remove-tavily-web-search.md](./remove-tavily-web-search.md) | Phase 0 security — removed Tavily webSearch tool and TAVILY_API_KEY dependency; Copilot now answers honestly from internal knowledge only |
| [reprocess-ux-overhaul.md](./reprocess-ux-overhaul.md) | Phase 1 operational UX — collapsed 3-step reprocess flow into a single "Save & Reprocess" button; failure banner with retry affordance; beforeunload guard while pipeline is running |
| [transcript-review-entity-panel-sidebar.md](./transcript-review-entity-panel-sidebar.md) | Phase 1 operational UX — entity panel moved to sticky right sidebar (xl+); mobile Sheet drawer; "Extracted by pipeline" read-only list from source_entities |
