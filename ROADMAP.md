# Sovereign Data — Development Roadmap

**Last updated**: February 25, 2026
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
| 3 | Team Management & Reports | IN PROGRESS | 40% (Obj 1 complete) |
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
| Interview detail: Marketing Assets section | Done | `src/app/(dashboard)/interviews/[id]/page.tsx` | Platform icons, status badges, copy-to-clipboard per snippet |
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

## Phase 3 — Team Management & Reports (IN PROGRESS)

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

### Remaining Tasks (Objectives 2–4)

| Task | Priority | Description |
|------|----------|-------------|
| Report generator | High | Select interviews/topics → GPT generates structured BI report |
| Report templates | Medium | Pre-built templates: "Country Risk Assessment", "Sector Analysis", "Entity Profile" |
| PDF export | Medium | Generate downloadable PDF from report data |
| Report sharing | Low | Shareable link with optional password protection |

### Technical Notes
- Reports generated via GPT-4o (not mini) for higher reasoning quality — user pays per report
- PDF generation via a library like `@react-pdf/renderer` or server-side with Puppeteer

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

---

## Database Schema Summary (9 Tables, 5 Migrations)

| Table | Purpose | Migration |
|-------|---------|-----------|
| `profiles` | Extends auth.users (auto-created via trigger) | 00001 |
| `projects` | RLS root, contains country/region | 00001 |
| `project_members` | Many-to-many with roles (owner/editor/viewer), invitation support | 00001, 00005 |
| `interviews` | Audio assets with status, transcript, summary, sentiment, topics, `source_type` | 00001, 00004 |
| `interview_chunks` | Vector store, HNSW indexed (`vector(1536)`), speaker-aware | 00001 |
| `entities` | Knowledge graph nodes (PERSON, COMPANY, GOVERNMENT, etc.) | 00001 |
| `entity_mentions` | Entity ↔ interview links with sentiment | 00001 |
| `entity_relationships` | Knowledge graph edges with typed relations, confidence, evidence | 00004 |
| `content_snippets` | Auto-generated marketing assets per interview | 00004 |

---

## How to Communicate This to a New Agent

Copy-paste this to start a new session:

```
Read the files HANDOVER.md and ROADMAP.md in the project root. HANDOVER.md is the
primary document — it contains the full business context, tech stack, architectural
constraints, known gotchas, and your immediate mission.

Current state: Phases 0, 1, 2, and 2.5 are ALL COMPLETE. The platform has a full
streaming RAG chat, dashboard with analytics, entity network explorer, and
interview deletion.

The database has 9 tables across 4 migrations. The ETL pipeline now extracts
entities AND relationships (GraphRAG), and auto-generates marketing snippets
(LinkedIn, Twitter, Newsletter, Summary) after each interview completes.

CRITICAL: Do NOT break the existing Chat (/chat), Dashboard (/dashboard), or
Interview Detail page. The admin client pattern, token_hash auth, and SECURITY
DEFINER RLS helpers are sacred — use them, don't replace them.
```
