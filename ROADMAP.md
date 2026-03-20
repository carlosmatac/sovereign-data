# Sovereign Data — Development Roadmap

**Last updated**: March 20, 2026
**Repo**: `git@github.com:carlosmatac/sovereign-data.git`
**Branch**: `main`

---

## Phase Overview

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 0 | Foundation | COMPLETE | 100% |
| 1 | Auth & Core Pipeline | COMPLETE | 100% |
| 2 | Conversational RAG & Analytics | COMPLETE | 100% |
| 2.5 | Graph & Event-Driven Architecture | COMPLETE | 100% |
| 3 | Team Management & Reports | COMPLETE | 100% |
| 3.5 | Intelligence Chat Upgrades | COMPLETE | 100% |
| 3.6 | Human Review & Interview Reprocessing | IN PROGRESS | 0% |
| 4 | Production Deployment | NOT STARTED | 0% |

---

## Phase 0 — Foundation (COMPLETE)

**Goal**: Deployable skeleton with full schema, typed clients, and project structure.

| Task | Status | Files |
|------|--------|-------|
| Next.js 15 + TypeScript + Tailwind + Shadcn/ui | Done | `package.json`, `components.json` |
| Directory structure (app routes, lib, components, types) | Done | `src/` tree |
| Supabase clients (browser, server, admin) | Done | `src/lib/supabase/` |
| Auth middleware (session guard, webhook exemption) | Done | `src/middleware.ts` |
| Database schema (7 tables, RLS, HNSW index, hybrid_search) | Done | `supabase/migrations/00001_initial_schema.sql` |
| TypeScript Database types (Row/Insert/Update for all tables) | Done | `src/types/database.ts` |
| App shell layout with sidebar navigation | Done | `src/app/(dashboard)/layout.tsx`, `app-sidebar.tsx` |
| Environment template | Done | `.env.local.example` |

**Commits**: `847460f`, `1e12867`

---

## Phase 1 — Auth & Core Pipeline (COMPLETE)

**Goal**: Working end-to-end flow: login → create project → upload audio → transcribe → extract → search.

### Completed Tasks

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| Magic Link login (token_hash flow) | Done | `login/page.tsx`, `auth/confirm/page.tsx` | See "Auth Gotchas" below |
| Auth callback handling | Done | `auth/callback/route.ts` | Forwards all params to client confirm page |
| Project creation (Server Action) | Done | `projects/actions.ts`, `projects/new/page.tsx` | Uses admin client pattern |
| Project list page | Done | `projects/page.tsx` | Grid with country/region badges |
| Interview upload page | Done | `interviews/upload/page.tsx` | Drag-drop, Storage upload, triggers API |
| Interview list page | Done | `interviews/page.tsx` | Status badges, project filter |
| Interview detail page | Done | `interviews/[id]/page.tsx` | Summary, entities, sentiment, transcript |
| Real-time status tracker | Done | `status-tracker.tsx` | Supabase Realtime subscription |
| Transcript viewer | Done | `transcript-viewer.tsx` | Speaker colors, search/highlight |
| Search page UI | Done | `search/page.tsx` | Intent filters, relevance scores, citations |
| API: create interview + trigger AssemblyAI | Done | `api/interviews/route.ts` | Admin client, speech_models fix applied |
| API: AssemblyAI webhook handler | Done | `api/webhooks/transcription/route.ts` | Triggers ETL pipeline |
| API: hybrid RAG search | Done | `api/search/route.ts` | Intent classification + pgvector |
| AI: AssemblyAI integration | Done | `lib/ai/assemblyai.ts` | `speech_models: ["universal-2"]` |
| AI: GPT-4o-mini extraction | Done | `lib/ai/extraction.ts` | Zod schema, Vercel AI SDK |
| AI: Speaker-aware chunking | Done | `lib/ai/chunking.ts` | ~500 tokens, respects speaker turns |
| AI: Embedding generation | Done | `lib/ai/embeddings.ts` | text-embedding-3-small, batch |
| AI: Full ETL orchestrator | Done | `lib/ai/pipeline.ts` | transcribe→extract→chunk→embed→persist |
| Storage bucket + policies | Done | `supabase/setup-storage.sql` | Run on Supabase |
| Realtime publication | Done | `supabase/enable-realtime.sql` | Run on Supabase |
| RLS recursion fix | Done | `supabase/migrations/00002_*.sql` | SECURITY DEFINER helpers |
| created_by default fix | Done | `supabase/migrations/00003_*.sql` | DEFAULT auth.uid() |

### Resolved During Testing

| Task | Resolution | Commit |
|------|-----------|--------|
| Webhook unreachable from AssemblyAI | Implemented polling fallback at `/api/interviews/[id]/poll` — status tracker polls every 10s | `e5b82ad` |
| OpenAI structured output schema errors | Changed `.optional()` to `.nullable()` in extraction schema; removed `.default([])` from search intent schema | `e5b82ad`, `88210fe` |
| Search returns 0 results | Lowered similarity threshold from 0.7 to 0.25 (text-embedding-3-small typical range); switched search to admin client for RLS bypass | `88210fe` |

### Phase 1 Completion Criteria — ALL MET
1. Audio file uploaded and reached status `COMPLETED`
2. Interview detail page shows: summary, entities, sentiment, full transcript
3. Search query on `/search` returns relevant chunks with similarity scores

**Commits**: `617cf16`, `24bf37b`, `623b7bd`, `dcbb6b0`, `e5b82ad`, `88210fe`

---

## Phase 2 — Conversational RAG & Analytics (COMPLETE)

**Goal**: Transform search from single-query to conversational, add dashboard analytics.

### Completed Tasks

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| Chat interface (streaming RAG) | Done | `chat/page.tsx`, `api/chat/route.ts` | Multi-turn with `streamText` + `useChat`, in-memory history |
| Chat citations | Done | `api/chat/route.ts` | Citation markers [1]–[8] with speaker, timestamp, and interview links |
| Dashboard home page | Done | `dashboard/page.tsx` | Stats cards, recent interviews, pipeline status, quick actions |
| Dashboard: interviews by project | Done | `dashboard/page.tsx` | Horizontal bar breakdown per project with completion counts |
| Dashboard: topic distribution | Done | `dashboard/page.tsx` | Top 12 topics across all interviews with visual bars |
| Dashboard: relationship stats | Done | `dashboard/page.tsx` | Entity count + relationship count in stats card, links to Network |
| Network Explorer page | Done | `network/page.tsx`, `network-explorer.tsx` | Two-panel entity explorer: search, filter by type, view connections with confidence scores and evidence |
| Sidebar: Network Explorer link | Done | `app-sidebar.tsx` | Added to Platform nav group |
| Interview deletion | Done | `api/interviews/[id]/route.ts`, `delete-interview-button.tsx` | DELETE API with Storage cleanup + CASCADE; confirmation dialog on detail + list pages |

**Commits**: `b855ca2`

---

## Phase 2.5 — Graph & Event-Driven Architecture (COMPLETE)

**Goal**: Evolve from linear ingestion to Knowledge Graph + automated content generation.

### Completed Tasks

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| Database evolution (migration 00004) | Done | `supabase/migrations/00004_graph_and_content.sql` | `entity_relationships`, `content_snippets` tables; `source_type` on interviews; 5 new enums |
| TypeScript types for new schema | Done | `src/types/database.ts` | Full Row/Insert/Update + Relationships for 2 new tables; 5 new enum types |
| Relationship extraction in AI pipeline | Done | `src/lib/ai/extraction.ts` | Added `relationships[]` to Zod schema (source, target, type, confidence, evidence) |
| Relationship persistence in ETL | Done | `src/lib/ai/pipeline.ts` | Step 7: entity name→ID map, upsert to `entity_relationships` |
| Marketing content generation module | Done | `src/lib/ai/content-generation.ts` | GPT-4o-mini generates LinkedIn, Twitter, Newsletter, Executive Summary per interview |
| Content generation in ETL pipeline | Done | `src/lib/ai/pipeline.ts` | Step 8: runs after COMPLETED, non-critical (failures don't affect pipeline status) |
| Interview detail: Marketing Assets section | Done (UI gated) | `src/app/(dashboard)/interviews/[id]/page.tsx`, `src/lib/feature-flags.ts` | Implemented; **hidden for demo** via `FEATURE_FLAGS.interviewMarketingAssetsUi` — set `true` to show. See `docs/features/interview-ui-visibility.md` |
| Interview detail: Relationships section | Done | `src/app/(dashboard)/interviews/[id]/page.tsx` | Source→Target with relation type, confidence %, evidence quotes |
| Copy-to-clipboard component | Done | `src/components/interviews/copy-button.tsx` | Client component with visual feedback |
| RLS for new tables | Done | `supabase/migrations/00004_graph_and_content.sql` | Reuses `is_project_member` + `get_interview_project` SECURITY DEFINER helpers |

### Schema Changes (Additive Only)

| Change | Details |
|--------|---------|
| `interviews.source_type` | New column, `source_type` enum, DEFAULT `'audio'` — zero impact on existing rows |
| `entity_relationships` table | Graph edges: source→target with relation_type, confidence, evidence_text, interview provenance |
| `content_snippets` table | Marketing assets: platform, content, tone, status lifecycle (draft→approved→published) |
| 5 new enums | `relation_type`, `source_type`, `snippet_platform`, `snippet_tone`, `snippet_status` |

### Phase 2.5 Completion Criteria — ALL MET
1. New interview processed with relationships extracted and persisted
2. Marketing snippets auto-generated after pipeline completion
3. Interview detail page displays both new sections
4. Existing Chat (`/chat`) and Dashboard (`/dashboard`) unaffected

---

## Phase 3 — Team Management & Reports (COMPLETE)

**Goal**: Multi-user collaboration and investor-grade report generation.

### Objective 1: Team Member Invitation & Role-Based UI (COMPLETE)

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| Database migration for invitations | Done | `supabase/migrations/00005_team_invitation_support.sql` | `invited_email` column on `project_members`, claim trigger |
| TypeScript types update | Done | `src/types/database.ts` | `invited_email` + nullable `user_id` on project_members |
| Project role utility | Done | `src/lib/auth/project-role.ts` | `getUserProjectRole()`, `getAuthUser()` helpers |
| Invite flow (Server Actions) | Done | `src/app/(dashboard)/projects/[id]/members/actions.ts` | `inviteTeamMember`, `updateMemberRole`, `removeMember` |
| Member management page | Done | `src/app/(dashboard)/projects/[id]/members/page.tsx` | Owner-only access, pending invites section |
| Member list component | Done | `src/components/projects/member-list.tsx` | Invite form, role selector, remove dialog |
| Project detail page | Done | `src/app/(dashboard)/projects/[id]/page.tsx` | Stats cards, quick actions, role-aware UI |
| Projects list → detail link | Done | `src/app/(dashboard)/projects/page.tsx` | Cards now link to `/projects/[id]` |
| Role-based interview list | Done | `src/app/(dashboard)/interviews/page.tsx` | Upload + delete buttons gated by editor/owner role |
| Role-based interview detail | Done | `src/app/(dashboard)/interviews/[id]/page.tsx` | Delete button gated by project role |
| Upload page project filter | Done | `src/app/(dashboard)/interviews/upload/page.tsx` | Dropdown only shows editable projects; supports `?project=` param |

### Schema Changes (Migration 00005)

| Change | Details |
|--------|---------|
| `project_members.invited_email` | New nullable TEXT column for pending invites |
| `project_members.user_id` | Changed to nullable (NULL while invite is pending) |
| `check_member_or_invite` constraint | At least one of `user_id` or `invited_email` must be set |
| `idx_unique_pending_invite` index | One pending invite per email per project |
| `claim_pending_invites()` trigger | Auto-fills `user_id` and clears `invited_email` when invitee's profile is created |

### Objective 1 Completion Criteria — ALL MET
1. Owner can invite team members by email (existing users added directly, new users receive Supabase Auth invite)
2. Owner can change member roles (editor ↔ viewer) and remove members
3. Viewers see read-only UI (no upload button, no delete buttons)
4. Editors/owners see upload + delete controls
5. Upload page only shows projects the user can edit
6. Project detail page shows role-appropriate actions

### Objective 2: Report Generator (COMPLETE)

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| Database migration for reports | Done | `supabase/migrations/00006_reports.sql` | `reports` table with status, template, content fields |
| TypeScript types | Done | `src/types/database.ts` | `Report`, `ReportStatus`, `ReportTemplate` types |
| Report templates & constants | Done | `src/lib/constants.ts` | 5 templates: Country Risk, Sector Analysis, Entity Profile, Executive Briefing, Custom |
| Report generation AI module | Done | `src/lib/ai/report-generation.ts` | GPT-4o (not mini), `streamText`, context from interviews + entities + relationships |
| Reports API route | Done | `src/app/api/reports/route.ts` | POST creates report row + streams generation; persists on finish |
| Report creation page | Done | `src/app/(dashboard)/reports/new/page.tsx` | 4-step wizard: project → template → interviews → generate with live streaming |
| Report detail page | Done | `src/app/(dashboard)/reports/[id]/page.tsx` | Rendered Markdown, source interview badges, status handling |
| Reports list page | Done | `src/app/(dashboard)/reports/page.tsx` | List with template labels, status badges, role-gated create button |
| Sidebar nav item | Done | `src/components/dashboard/app-sidebar.tsx` | "Reports" added to Platform nav group |

### Objective 3: PDF Export (COMPLETE)

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| React PDF renderer | Done | `src/lib/pdf/report-pdf.tsx` | Professional layout: header, sources, Markdown→PDF parsing, footer |
| PDF API endpoint | Done | `src/app/api/reports/[id]/pdf/route.ts` | GET returns downloadable PDF, auth + membership verified |
| Export button | Done | `src/app/(dashboard)/reports/[id]/page.tsx` | "Export PDF" button on completed reports |

### Schema Changes (Migration 00006)

| Change | Details |
|--------|---------|
| `reports` table | New table: `id`, `project_id`, `title`, `template`, `status`, `content`, `summary`, `interview_ids[]`, `parameters`, `error_message`, `created_by`, timestamps |
| `report_status` enum | `generating`, `completed`, `failed` |
| `report_template` enum | `country_risk`, `sector_analysis`, `entity_profile`, `executive_briefing`, `custom` |
| RLS policies | Members can view, editors can create/update, owners can delete |

### Objective 4: Report Sharing (COMPLETE)

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| Database migration for sharing | Done | `supabase/migrations/00007_report_sharing.sql` | `share_token` + `share_password` columns on `reports` |
| TypeScript types update | Done | `src/types/database.ts` | `share_token`, `share_password` nullable fields |
| Share/unshare Server Actions | Done | `src/app/(dashboard)/reports/[id]/actions.ts` | `shareReport()`, `unshareReport()` — editor/owner only |
| Share button & dialog | Done | `src/components/reports/share-report-button.tsx` | Copy link, optional password, revoke — appears on completed reports |
| Public shared report API | Done | `src/app/api/shared/[token]/route.ts` | GET validates token + password hash, returns report JSON |
| Public shared report page | Done | `src/app/shared/[token]/page.tsx` | Password prompt, rendered Markdown, branding, no auth required |
| Middleware update | Done | `src/middleware.ts` | `/shared` and `/api/shared` routes bypass auth redirect |

### Schema Changes (Migration 00007)

| Change | Details |
|--------|---------|
| `reports.share_token` | Nullable, UNIQUE TEXT column — random base64url token |
| `reports.share_password` | Nullable TEXT column — SHA-256 hashed password (NULL = no password) |
| `idx_reports_share_token` | Partial index for fast token lookups |

### Phase 3 Completion Criteria — ALL MET
1. Owner can invite team members; roles enforce read-only vs read-write UI
2. Report generator produces 5 template types via GPT-4o streaming
3. PDF export downloads professional branded documents
4. Shared links allow unauthenticated viewing (with optional password)

**Commits**: `66d2bb1`, `6177b3b`, + Phase 3 Obj 4 commit

---

## Phase 3.5 — Intelligence Chat Upgrades & Sales War Room (COMPLETE)

**Goal**: Transform the Intelligence Chat from a closed RAG into an Agentic RAG with TBY-specific persona and real-time web intelligence. Add a Sales War Room to the project dashboard.

### Objective 1: Intelligence Chat Upgrades (COMPLETE)

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| TBY Master Persona injection | Done | `api/chat/route.ts` | Full TBY identity: team structure, products, jargon (pitch, drop-off, all-in-one, barter), 4 strategic directives |
| Second-Order Thinking directive | Done | `api/chat/route.ts` | 3-step cascade for lead generation: Orbit (entity extraction) → Market Gap (sector deduction) → Ideal Target Profile (anti-hallucination fallback) |
| Agentic RAG with web search tool | Done | `api/chat/route.ts` | Tavily Search API via `tool()` + `stopWhen: stepCountIs(3)`; model autonomously decides when to search the web |
| Web search citation format | Done | `api/chat/route.ts` | Internal citations `[1]`–`[8]` preserved; web results cited as inline markdown links + "Web Sources" section |
| Graceful degradation | Done | `api/chat/route.ts`, `.env.local.example` | `TAVILY_API_KEY` is optional; if missing, tool returns "unavailable" message instead of throwing |

### Objective 2: Sales War Room (COMPLETE)

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| Mock HubSpot service | Done | `src/lib/mockHubspot.ts` | `HubspotDealRaw` type (mirrors real HubSpot payload), 13 mock deals across all stages, 800ms artificial delay, `SIMULATE_ERROR` toggle |
| UI domain model + adapter | Done | `src/lib/mockHubspot.ts` | `Deal` type, `mapHubspotDealsToUiDeals()` adapter, computes outstanding amounts, normalizes barter |
| KPI + Pipeline selectors | Done | `src/lib/mockHubspot.ts` | `selectKpis()` → closedCash/pending/barter/progressPct, `selectPipelineHealth()` → counts by active stage. Pure functions, no JSX |
| War Room client component | Done | `projects/[id]/war-room.tsx` | Revenue target progress bar, 3 financial metric cards, pipeline health grid, filterable deals preview (top 5 by amount) |
| Loading/Empty/Error states | Done | `projects/[id]/war-room.tsx` | Skeleton placeholders, friendly empty CTA, error card with retry button |
| Project page redesign | Done | `projects/[id]/page.tsx` | Two-column layout: War Room (primary) + Project Ops sidebar (stats cards, quick actions). Responsive stacking on mobile |

### Architecture Decisions (Phase 3.5)

| Decision | Rationale |
|----------|-----------|
| Pre-injected internal RAG + on-demand web search | Internal `hybrid_search` always runs (zero-latency path for most queries); web search is additive via tool calling — model decides when it's needed |
| `stopWhen: stepCountIs(3)` not `maxSteps` | AI SDK v6 replaced `maxSteps` with `stopWhen`; 3 steps allows: internal context → web search → final answer |
| `inputSchema` not `parameters` on `tool()` | AI SDK v6 renamed the property; using Zod v4 schema directly |
| Tavily via raw `fetch` (no SDK) | Single POST endpoint; avoids adding a dependency for a 10-line function |
| `topic: "general" \| "news"` parameter | Lets the model target news-specific results when user asks about recent developments vs. general company/sector research |
| Graceful API key handling | Missing `TAVILY_API_KEY` returns a structured "unavailable" result — tool never throws, model falls back to internal-only context |
| Mock HubSpot service with real payload shape | `HubspotDealRaw` mirrors actual HubSpot API response structure; when real integration comes, only `getDeals()` needs to change — adapter and selectors stay identical |
| Selectors as pure functions (not inline JSX) | `selectKpis()` and `selectPipelineHealth()` are testable, reusable, and decoupled from rendering |
| War Room as client component (not RSC) | Needs client-side state for loading/error/retry + filter state; mock data has no server dependencies |
| Two-column layout (War Room + Project Ops) | Revenue data is the primary concern for CMs; interview/team stats demoted to sidebar but still one click away |

---

## Phase 3.6 — Human Review & Interview Reprocessing (IN PROGRESS)

**Goal**: Let editors correct ASR transcripts, seed entities with search/create, and **reprocess** an interview so chunks, mentions, relationships, and downstream intelligence are rebuilt from **reviewed utterances only**, with **human seed entities** as mandatory strong inputs to extraction and graph persistence — without overwriting immutable raw transcript.

**Documentation**: [Interview transcript review](docs/features/interview-transcript-review.md), [Ingestion pipeline — human review layer](docs/architecture/ingestion-pipeline.md#human-review-layer--reviewed-reprocessing).

### Locked architecture rules

1. **Single source of truth (reviewed pass)** — For a reviewed reprocessing run, `reviewed_utterances` is the only transcript source. The pipeline derives **reviewed full text** (for LLM extraction) and **reviewed chunks** (for embeddings, grounding, relationships) from it. Raw `transcript_full` / AssemblyAI text must not be mixed into that pass.
2. **Strong human entities** — Rows in `interview_review_entities` are not passive annotations. They must be passed into extraction and influence mention recovery, relationship extraction, and final persistence (`entity_mentions`, `entity_relationships`, entity resolution).
3. **Failure-safe swap** — If rebuild fails before commit, derived interview data must remain unchanged. **MVP approach**: run all expensive steps (LLM, embeddings) **off-DB** or without mutating existing chunks; perform **delete old derived rows + insert new rows** inside **one PostgreSQL transaction** so a failure rolls back to the previous graph/chunks.
4. **Structured seed table** — Prefer `interview_review_entities` (relational table) over JSON-only blobs for auditability and future fields (e.g. spans, provenance).

### Implementation order

| Step | Scope | Status |
|------|--------|--------|
| 1 | Docs (roadmap, ingestion, schema, feature doc, README, HITL cross-link) | Done |
| 2 | Migration + `database.ts` + pipeline entrypoint (`runIntelPipelineFromTranscriptInput` / `reprocessInterviewFromReview`) | Done |
| 3 | Review UI (utterance editor, entity combobox, save draft, mark ready) | Done |
| 4 | Reprocess endpoint + transactional swap | Not started |

### Phase 3.6 completion criteria (target)

1. Editor can open transcript review, edit reviewed utterances, manage seed entities (search + create), save draft.
2. Reprocess completes from reviewed data only; search/chat see new chunks after success.
3. Failed reprocess leaves prior `COMPLETED` derived data intact (transactional swap).

---

## Phase 4 — Production Deployment (NOT STARTED)

**Goal**: Live on Vercel with production environment, monitoring, and security hardening.

### Planned Tasks

| Task | Priority | Description |
|------|----------|-------------|
| Deploy to Vercel | High | Connect repo, configure build |
| Production env vars | High | All API keys in Vercel Dashboard |
| Custom domain | High | Point domain to Vercel |
| Update Supabase URLs | High | Site URL + Redirect URLs for production domain |
| Update webhook URL | High | `NEXT_PUBLIC_APP_URL` → production URL for AssemblyAI |
| Rate limiting | Medium | Protect API routes from abuse |
| Error monitoring | Medium | Sentry or similar for production error tracking |
| Zero retention audit | Medium | Verify AssemblyAI + OpenAI data handling policies |
| Backup strategy | Low | Supabase daily backups + point-in-time recovery |
| Performance optimization | Low | Edge caching, image optimization, bundle analysis |

---

## Known Issues & Architectural Decisions

### Issues Resolved

| Issue | Root Cause | Solution | Commit |
|-------|-----------|----------|--------|
| PKCE code verifier error | Magic link opened in different browser | Switched to token_hash flow via custom email templates | `24bf37b` |
| `CREATE EXTENSION "pgvector"` fails | Supabase names it `"vector"` | Changed to `"vector"` in migration | Applied in `00001` |
| `gin_trgm_ops` not found | `pg_trgm` extension created after index | Moved extension creation to top of migration | Applied in `00001` |
| RLS infinite recursion | `project_members` policies self-reference | `SECURITY DEFINER` helper functions | `623b7bd` |
| `auth.uid()` NULL in PostgREST | `@supabase/ssr` cookie-JWT propagation issue | Admin client pattern: verify with `getUser()`, write with service role | `623b7bd` |
| AssemblyAI `speech_model` error | API changed in 2026, requires param | Added `speech_models: ["universal-2"]` (plural, array) | `dcbb6b0` |

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Server Actions + admin client for mutations | `auth.uid()` is NULL in PostgREST context; admin client bypasses RLS after verifying user server-side |
| token_hash auth flow | PKCE fails cross-browser; token_hash works everywhere |
| `SECURITY DEFINER` RLS helpers | Prevents infinite recursion in project_members policies |
| Speaker-aware chunking | Preserves speaker turns in RAG results; critical for attribution |
| HNSW index (not IVFFlat) | Better recall at our scale; no need for periodic reindexing |
| GPT-4o-mini for extraction | $0.15/1M tokens — 10x cheaper than GPT-4o, sufficient for structured extraction |
| Hybrid search (SQL + vector) | Pre-filtering by country/topic reduces hallucination risk by narrowing search space |
| Additive schema evolution (Phase 2.5) | New tables + columns with defaults — zero breaking changes to existing pipeline or UI |
| Entity relationships as graph edges | Enables GraphRAG: source→target with typed relation, confidence, and evidence provenance |
| Async content generation post-pipeline | Runs after COMPLETED, wrapped in try/catch — failures are non-critical and don't affect interview status |
| Content snippet lifecycle (draft→approved→published) | Supports future editorial workflow without schema changes |
| Interview deletion via CASCADE | Deleting an interview removes all chunks, mentions, relationships, snippets; audio cleaned from Storage separately |
| Network Explorer as list-based explorer (not force graph) | More practical for business users; zero heavy dependencies; entity search + type filters + evidence quotes |
| Dashboard analytics without charting library | Pure CSS/Tailwind progress bars; avoids bundle bloat; sufficient for current data density |
| Report sharing via token (not separate table) | Two columns on `reports` (`share_token`, `share_password`) — simpler than a join table; one link per report; password hashed with SHA-256 |
| Public shared pages bypass middleware | `/shared/*` and `/api/shared/*` added to middleware exclusion list; admin client fetches report by token (no RLS needed) |
| Agentic RAG (hybrid internal + web search) | Pre-injected `hybrid_search` context + Tavily web search as AI SDK tool; model autonomously decides when to search the web; `stopWhen: stepCountIs(3)` |
| TBY Master Persona in system prompt | Full business context (team roles, sales products, jargon) injected into every chat; enables domain-native reasoning without user explanation |
| Second-Order Thinking for lead gen | 3-step cascade (Orbit → Market Gap → Ideal Target Profile) prevents recommending already-interviewed companies; anti-hallucination fallback |
| Mock HubSpot with real payload shape | `HubspotDealRaw` mirrors HubSpot API; adapter + selectors won't change when real API is connected |
| Sales War Room as client component | Needs loading/error/retry + filter state; pure selectors keep business logic out of JSX |

---

## Database Schema Summary (10 Tables, 11 Migrations)

| Table | Purpose | Migration |
|-------|---------|-----------|
| `profiles` | Extends auth.users (auto-created via trigger) | 00001 |
| `projects` | RLS root, contains country/region | 00001 |
| `project_members` | Many-to-many with roles (owner/editor/viewer), invitation support | 00001, 00005 |
| `interviews` | Audio assets with status, transcript (`transcript_full` raw + `transcript_display` cleaned), summary, sentiment, topics, `source_type`, `expected_speakers`, interview anchors (`interviewee_name`, `interviewee_org`) | 00001, 00004, 00008, 00010, 00011 |
| `interview_chunks` | Vector store, HNSW indexed (`vector(1536)`), speaker-aware | 00001 |
| `entities` | Knowledge graph nodes (PERSON, COMPANY, GOVERNMENT, etc.) | 00001 |
| `entity_mentions` | Entity ↔ interview links with sentiment | 00001 |
| `entity_relationships` | Knowledge graph edges with typed relations, confidence, evidence | 00004 |
| `content_snippets` | Auto-generated marketing assets per interview | 00004 |
| `reports` | AI-generated BI reports with template, status, content, sharing | 00006, 00007 |

---

## How to Communicate This to a New Agent

Copy-paste this to start a new session:

```
Read the files HANDOVER.md and ROADMAP.md in the project root. HANDOVER.md is the
primary document — it contains the full business context, tech stack, architectural
constraints, known gotchas, and your immediate mission.

Current state: Phases 0–3.5 are ALL COMPLETE. The platform has:
- Full audio ingestion pipeline (upload → transcribe → extract entities &
  relationships → chunk → embed → generate marketing snippets)
- Agentic RAG chat with TBY persona, Second-Order Thinking, and Tavily web search
- Dashboard with analytics (project breakdown, topic distribution)
- Network Explorer for entity relationships
- Team management with role-based access (owner/editor/viewer)
- AI report generator with 5 templates (GPT-4o streaming)
- PDF export via @react-pdf/renderer
- Report sharing via public links with optional password protection
- Interview deletion with CASCADE cleanup
- Sales War Room on project dashboard (mock CRM data, ready for HubSpot integration)
- Upload anchors for interviewee/org to improve ASR + extraction consistency
- Transcript display layer with cleaned/original toggle and owner-triggered recompute

The database has 10 tables across 11 migrations. See ROADMAP.md for full task
history and architecture decisions.

Your immediate task is Phase 4: Production Deployment. Propose the approach first,
wait for approval before making changes.

CRITICAL: Do NOT break existing features. The admin client pattern, token_hash
auth, and SECURITY DEFINER RLS helpers are sacred — use them, don't replace them.
```
