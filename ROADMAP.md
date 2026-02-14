# Sovereign Data — Development Roadmap

**Last updated**: February 14, 2026
**Repo**: `git@github.com:carlosmatac/sovereign-data.git`
**Latest commit**: `e5b82ad` (7 commits on `main`)

---

## Phase Overview

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 0 | Foundation | COMPLETE | 100% |
| 1 | Auth & Core Pipeline | IN PROGRESS | ~90% |
| 2 | Conversational RAG & Analytics | NOT STARTED | 0% |
| 3 | Team Management & Reports | NOT STARTED | 0% |
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

## Phase 1 — Auth & Core Pipeline (IN PROGRESS ~90%)

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

### Remaining Tasks (to close Phase 1)

| Task | Status | Blocker | Notes |
|------|--------|---------|-------|
| Test upload → AssemblyAI submission | NEEDS TEST | `speech_models` fix just deployed | Retry audio upload |
| Solve webhook reachability | BLOCKED | AssemblyAI can't reach localhost | Use ngrok, or deploy to Vercel, or implement polling fallback |
| Test full ETL pipeline | BLOCKED | Depends on webhook working | Transcript → extraction → chunking → embedding → DB |
| Verify interview detail page renders results | BLOCKED | Depends on pipeline completing | Summary, entities, transcript, sentiment |
| Test Intelligence Search end-to-end | BLOCKED | Depends on chunks existing in DB | Query → intent → hybrid_search → results |
| Verify Realtime status updates | BLOCKED | Depends on pipeline running | Status tracker should animate through stages |

### Phase 1 Completion Criteria
Phase 1 is DONE when:
1. An audio file is uploaded and reaches status `COMPLETED`
2. The interview detail page shows: summary, entities, sentiment, full transcript
3. A search query on `/search` returns relevant chunks with similarity scores

**Commits**: `617cf16`, `24bf37b`, `623b7bd`, `dcbb6b0`

---

## Phase 2 — Conversational RAG & Analytics (NOT STARTED)

**Goal**: Transform search from single-query to conversational, add dashboard analytics.

### Planned Tasks

| Task | Priority | Description |
|------|----------|-------------|
| Chat interface | High | Multi-turn conversation with the knowledge base. Use Vercel AI SDK `streamText` with chat history. Context window = top RAG chunks + conversation history. |
| Chat citations | High | Each answer links to specific chunks with audio timestamps. Clicking a citation plays the audio from that timestamp. |
| Dashboard home page | Medium | Replace `/projects` as landing page. Show: total interviews, processing queue, recent activity. |
| Interview count by project | Medium | Card/chart showing interviews per project with status breakdown. |
| Entity network graph | Medium | Visualization of entity relationships across interviews (who mentions whom). |
| Topic heatmap | Low | Matrix of topics × countries with interview density. |
| Trending topics | Low | Time-series of topic frequency across interviews. |

### Technical Notes
- Chat should use `streamText` from Vercel AI SDK for streaming responses
- Chat history stored in-memory (no DB persistence for MVP)
- Dashboard analytics via Supabase aggregate queries (COUNT, GROUP BY)
- Entity graph can use a simple force-directed layout (e.g., D3 or a React lib)

---

## Phase 3 — Team Management & Reports (NOT STARTED)

**Goal**: Multi-user collaboration and investor-grade report generation.

### Planned Tasks

| Task | Priority | Description |
|------|----------|-------------|
| Invite team members | High | Email invite flow → creates project_member with role |
| Role-based UI | High | Viewers: read-only. Editors: upload + edit. Owners: full control. |
| Member management page | High | List members, change roles, remove members |
| Report generator | High | Select interviews/topics → GPT generates structured BI report |
| Report templates | Medium | Pre-built templates: "Country Risk Assessment", "Sector Analysis", "Entity Profile" |
| PDF export | Medium | Generate downloadable PDF from report data |
| Report sharing | Low | Shareable link with optional password protection |

### Technical Notes
- Invite flow: owner enters email → creates `project_members` row → sends invite email
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

---

## How to Communicate This to a New Agent

Copy-paste this to start a new session:

```
Read the file ROADMAP.md in the project root. It contains the complete
development roadmap with phase status, completed tasks, remaining work,
known issues, and architectural decisions.

Current status: Phase 1 is at ~90%. All code exists but the end-to-end
pipeline (upload → AssemblyAI transcription → webhook → GPT extraction →
embeddings → search) has not been verified working yet. The main blocker
is likely that AssemblyAI webhooks cannot reach localhost.

Your task: Close Phase 1 by making the pipeline work end-to-end. Once an
interview reaches COMPLETED status and is searchable from /search, Phase 1
is done and we move to Phase 2 (conversational RAG chat + dashboard analytics).
```
