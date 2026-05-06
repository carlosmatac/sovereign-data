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

New completed features: add a row here when you move a spec into this folder.
