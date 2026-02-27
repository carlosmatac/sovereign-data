# SOVEREIGN DATA — MASTER HANDOVER DOCUMENT & SYSTEM PROMPT

**Date**: February 26, 2026
**Repo**: `git@github.com:carlosmatac/sovereign-data.git`
**Branch**: `main`
**Runtime**: Next.js dev server on `http://localhost:3000`

---

## 1. BUSINESS CONTEXT & VISION (The "Why")

**Sovereign Data** is a Frontier Markets Intelligence Platform for a media/consulting firm operating in the Global South (Africa, LatAm, Asia). The firm conducts 60–90 minute exclusive interviews with Ministers, CEOs, and Diplomats. Currently, the intelligence in these audio files "dies" after the article is written.

**The platform is evolving from a passive audio archive into an Active Business Intelligence Engine** to solve three core pain points:

### Pillar 1: Sales Intelligence (GraphRAG — Break Information Silos)
A salesperson in Colombia needs to know if a Minister they are meeting was mentioned negatively by a CEO in a Nigeria project. We need **cross-project relationship mapping** (a "Network Explorer") so salespeople can see who is connected to whom, how, and with what sentiment. This directly increases deal closure rates.

### Pillar 2: Editorial Strategy (Multi-modal + Trend Detection)
Editors need to spot global trends (e.g., "Green Hydrogen") across all interviews to decide on new markets or magazine covers. We're moving from intuition-based editorial decisions to **data-driven trend detection**. The architecture must also prepare for **multi-modal ingestion** (PDFs, prep documents) beyond just audio.

### Pillar 3: Push Marketing (TBY Marketing Automation)
The team wastes hours manually clipping interviews for social media. The system must **automatically generate ready-to-publish content** — LinkedIn posts, Twitter threads, newsletter snippets — the moment an interview finishes processing. Zero manual effort.

---

## 2. CURRENT STATE & TECH STACK (What We Have)

### Stack (Strict Constraints)

| Layer | Technology | Version / Notes |
|-------|-----------|-----------------|
| Frontend | Next.js 15 (App Router), TypeScript | Turbopack, `src/` directory, `next@16.1.6` |
| UI | Tailwind CSS v4, shadcn/ui, lucide-react | 20 Shadcn components installed |
| Auth | Supabase Auth | **Magic Links via token_hash flow (NOT PKCE)** — do not change this |
| Database | Supabase PostgreSQL 16 + pgvector | HNSW index, 1536 dimensions, EU (Frankfurt) |
| Storage | Supabase Storage | `interview-audio` bucket, public read |
| Transcription | AssemblyAI | `speech_models: ["universal-2"]` (plural, array — API changed in 2026) |
| Extraction | OpenAI GPT-4o-mini | Via Vercel AI SDK `generateObject` with Zod schemas |
| Embeddings | OpenAI text-embedding-3-small | 1536 dimensions |
| Orchestration | Vercel AI SDK v6 (`ai@^6.0.82`, `@ai-sdk/openai@^3.0.27`, `@ai-sdk/react`) | `streamText`, `generateObject`, `useChat`, `tool`, `stepCountIs` |
| Web Search | Tavily Search API (raw `fetch`, no SDK) | Agentic RAG tool for real-time web intelligence; optional (`TAVILY_API_KEY`) |
| Markdown | `react-markdown` | For chat response rendering |

### Phase Status

| Phase | Status | What's Done |
|-------|--------|-------------|
| **Phase 0** | COMPLETE | Scaffold, schema, typed clients, app shell |
| **Phase 1** | COMPLETE | Auth, upload, AssemblyAI transcription, GPT extraction (entities + relationships), chunking, embeddings, search — full end-to-end pipeline |
| **Phase 2** | COMPLETE | Dashboard (stats, project breakdown, topic distribution), Intelligence Chat (streaming RAG), Network Explorer (entity relationship browser), interview deletion |
| **Phase 2.5** | COMPLETE | Graph schema evolution (`entity_relationships`, `content_snippets`, `source_type`), relationship extraction in pipeline, auto-generated marketing snippets (LinkedIn, Twitter, Newsletter, Summary) |
| **Phase 3** | COMPLETE | Team management (invite, roles, RBAC), AI report generator (5 templates), PDF export, report sharing (public links + password) |
| **Phase 3.5** | COMPLETE | Intelligence Chat upgrades (TBY persona, Second-Order Thinking, Agentic RAG), Sales War Room on project dashboard (mock CRM data) |
| **Phase 4** | NOT STARTED | Production deployment |

### Database — 10 Tables, 7 Migrations Applied

| Table | Purpose |
|-------|---------|
| `profiles` | Extends auth.users (auto-created via trigger) |
| `projects` | RLS root, contains country/region |
| `project_members` | Many-to-many with roles (owner/editor/viewer), `invited_email` for pending invites |
| `interviews` | Audio assets with status, transcript, summary, sentiment, topics, `source_type` |
| `interview_chunks` | Vector store, HNSW indexed (`vector(1536)`), speaker-aware |
| `entities` | Knowledge graph nodes (PERSON, COMPANY, GOVERNMENT, etc.) |
| `entity_mentions` | Entity ↔ interview links with sentiment |
| `entity_relationships` | Graph edges: source→target with `relation_type`, `confidence`, `evidence_text`, interview provenance |
| `content_snippets` | Auto-generated marketing assets: `platform`, `content`, `tone`, `status` lifecycle |
| `reports` | AI-generated BI reports: template, status, Markdown content, source interview_ids, sharing (token + password) |

Key SQL extensions: `vector` (not "pgvector"), `pg_trgm`, `uuid-ossp` — all in `extensions` schema.

Key enums (12 total): `interview_status`, `entity_type`, `user_role`, `relation_type`, `source_type`, `snippet_platform`, `snippet_tone`, `snippet_status`, `report_status`, `report_template`.

Migrations: `00001` (initial), `00002` (RLS SECURITY DEFINER), `00003` (created_by default), `00004` (graph + content), `00005` (team invitations), `00006` (reports), `00007` (report sharing).

### File Structure (~90 source files)

```
src/
├── app/
│   ├── (auth)/login, auth/callback, auth/confirm
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx         # Stats, project breakdown, topic distribution, quick actions
│   │   ├── chat/page.tsx              # Streaming RAG conversation
│   │   ├── network/page.tsx           # Entity relationship explorer (two-panel)
│   │   ├── projects/page.tsx, [id]/page.tsx, [id]/war-room.tsx, [id]/members/
│   │   ├── reports/page.tsx, new/page.tsx, [id]/page.tsx, [id]/actions.ts
│   │   ├── interviews/, search/, settings/
│   │   └── layout.tsx                 # Auth guard + sidebar
│   ├── shared/[token]/page.tsx        # Public shared report page (no auth)
│   ├── api/
│   │   ├── chat/route.ts             # Agentic RAG: streamText + hybrid_search + Tavily web search tool (maxSteps: 3)
│   │   ├── interviews/route.ts       # Create + submit to AssemblyAI
│   │   ├── interviews/[id]/route.ts  # DELETE interview (Storage + CASCADE)
│   │   ├── interviews/[id]/poll/route.ts  # Polling fallback
│   │   ├── reports/route.ts          # POST create + stream report generation
│   │   ├── reports/[id]/pdf/route.ts # GET downloadable PDF
│   │   ├── shared/[token]/route.ts   # GET shared report (public, password check)
│   │   ├── search/route.ts           # Intent classification + hybrid_search
│   │   └── webhooks/transcription/route.ts
│   ├── layout.tsx, page.tsx (redirects to /dashboard)
├── components/
│   ├── dashboard/app-sidebar.tsx      # 8 nav items: Dashboard, Projects, Interviews, Reports, Search, Chat, Network, Settings
│   ├── interviews/status-tracker.tsx
│   ├── interviews/transcript-viewer.tsx
│   ├── interviews/copy-button.tsx     # Copy-to-clipboard (client component)
│   ├── interviews/delete-interview-button.tsx  # Delete with confirmation dialog
│   ├── network/network-explorer.tsx   # Interactive entity explorer (client component)
│   ├── projects/member-list.tsx       # Team member management (client component)
│   ├── reports/share-report-button.tsx # Share dialog with link + password (client component)
│   └── ui/ (20 shadcn components)
├── lib/
│   ├── ai/assemblyai.ts, extraction.ts, chunking.ts, embeddings.ts, pipeline.ts, content-generation.ts, report-generation.ts
│   ├── mockHubspot.ts                # Mock CRM service: HubSpot-like deal data, adapter, KPI/pipeline selectors
│   ├── pdf/report-pdf.tsx             # @react-pdf/renderer PDF document
│   ├── auth/project-role.ts            # getUserProjectRole(), getAuthUser()
│   ├── supabase/client.ts, server.ts, admin.ts
│   └── constants.ts
├── types/database.ts                  # Full typed Database interface (10 tables, 12 enums)
└── middleware.ts                       # Auth guard; /shared, /api/shared bypass
```

### CRITICAL Gotchas (Do NOT Violate)

1. **auth.uid() is NULL in PostgREST context** — ALL mutations use the "admin client pattern": verify user with `getUser()`, then use service role client for DB writes. This is not a bug, it's the established architecture.

2. **OpenAI structured outputs require ALL fields to be required** — No `.optional()` or `.default()` in Zod schemas passed to `generateObject`. Use `.nullable()` instead.

3. **AssemblyAI webhooks cannot reach localhost** — A polling fallback exists at `/api/interviews/[id]/poll` that checks AssemblyAI directly and triggers the pipeline. The status tracker polls every 10s.

4. **Similarity threshold is 0.25** (not 0.7) — `text-embedding-3-small` returns cosine similarities in the 0.3–0.6 range for related content. Set in `AI_CONFIG` in `constants.ts`.

5. **AI SDK v6 breaking changes** — `useChat` returns `{ messages, sendMessage, status, error }`, NOT `{ input, handleSubmit, isLoading }`. Messages use `.parts` array (not `.content`). Server uses `toUIMessageStreamResponse()`.

6. **Token_hash auth flow** — Email templates in Supabase Dashboard use `{{ .TokenHash }}`, the client page `/auth/confirm` calls `verifyOtp({ token_hash, type })`. Do NOT switch to PKCE.

7. **SECURITY DEFINER helpers** — RLS policies use `is_project_member()`, `is_project_owner()`, etc. functions to avoid infinite recursion. See migration `00002`.

8. **Interview deletion uses CASCADE** — Deleting from `interviews` automatically removes all `interview_chunks`, `entity_mentions`, `entity_relationships`, and `content_snippets`. Audio is deleted from Storage separately in the DELETE API handler.

9. **Agentic RAG uses `stopWhen: stepCountIs(3)`** — AI SDK v6 replaced `maxSteps` with `stopWhen`. The chat route uses `stepCountIs(3)` to allow up to 3 steps: internal context → optional web search → final answer. The `tool()` helper uses `inputSchema` (not `parameters`). Tavily web search is optional — if `TAVILY_API_KEY` is missing, the tool returns a graceful "unavailable" message instead of throwing.

### Environment Variables (`.env.local` — populated, gitignored)

```
NEXT_PUBLIC_SUPABASE_URL=https://pirgarfjqbymzqpgqjgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<set>
SUPABASE_SERVICE_ROLE_KEY=<set>
ASSEMBLYAI_API_KEY=<set>
OPENAI_API_KEY=<set>
NEXT_PUBLIC_APP_URL=http://localhost:3000
WEBHOOK_SECRET=<set>
TAVILY_API_KEY=<set>  # Optional — web search disabled gracefully if missing
```

---

## 3. PHASE 3 — Team Management & Reports (COMPLETE)

### Objective 1: Team Member Invitation & Management — COMPLETE

Multi-user collaboration layer built on `project_members` table:

- **Invite flow**: Owner enters email → existing users added directly, new users get Supabase Auth invite email → pending invites auto-claimed on signup via `claim_pending_invites()` trigger.
- **Member management page** (`/projects/[id]/members`): List members, change roles, remove members, revoke pending invites. Owner-only access.
- **Project detail page** (`/projects/[id]`): Sales War Room (revenue target, financial KPIs, pipeline health, deal preview with filters) + Project Ops sidebar (interview/member/role cards, quick actions). Two-column layout on desktop, stacked on mobile.
- **Role-based UI**: Viewers see read-only views (no upload, no delete). Editors can upload and delete. Owners have full control including member management.
- Upload page project dropdown filtered to editable projects only.
- Uses existing SECURITY DEFINER helpers + admin client pattern for all mutations.

### Objective 2: Report Generator — COMPLETE

- **Report creation page** (`/reports/new`): 4-step wizard — select project → choose template → pick interviews → generate. Live streaming of GPT-4o output.
- **5 report templates**: Country Risk Assessment, Sector Analysis, Entity Profile, Executive Briefing, Custom — each with predefined section structure.
- **Report detail page** (`/reports/[id]`): Rendered Markdown, source interview badges, generation status.
- **Reports list page** (`/reports`): All reports with status badges, role-gated create button.
- Uses `streamText` with GPT-4o (not mini) for streaming; report saved to DB on `onFinish`.
- Context includes interview summaries, entity mentions, and entity relationships.

### Objective 3: PDF Export — COMPLETE

- **`@react-pdf/renderer`** (React components → PDF) at `/api/reports/[id]/pdf`.
- Professional layout: branded header, source interviews box, Markdown→PDF parsing (headings, bullets, paragraphs), fixed footer with confidentiality notice and page numbers.
- Auth + project membership verified before generating PDF.

### Objective 4: Report Sharing — COMPLETE

- **Share dialog** on report detail page: Editors/owners can generate a shareable link with optional password protection.
- **Server Actions** (`shareReport`, `unshareReport`): Generate/revoke `share_token`, hash password with SHA-256, stored on `reports` table.
- **Public route** (`/shared/[token]`): Unauthenticated page that fetches report via `/api/shared/[token]`. Shows password prompt if report is protected, then renders full Markdown content with branding.
- **Middleware bypass**: `/shared` and `/api/shared` paths skip the auth redirect.
- Migration `00007_report_sharing.sql` adds `share_token` (UNIQUE) and `share_password` columns.

### CRITICAL CONSTRAINT
You must NOT break the existing Chat (`/chat`), Dashboard (`/dashboard`), Network Explorer (`/network`), or Interview Detail pages. All new features must be additive. The admin client pattern, token_hash auth, and SECURITY DEFINER RLS helpers are sacred — use them, don't replace them.

---

## 4. IMMEDIATE MISSION: PHASE 4 — Production Deployment

### Planned Tasks

| Task | Priority | Description |
|------|----------|-------------|
| Deploy to Vercel | High | Connect repo, configure build settings, `next build` already passes |
| Production env vars | High | All API keys (Supabase, OpenAI, AssemblyAI) in Vercel Dashboard |
| Custom domain | High | Point domain to Vercel deployment |
| Update Supabase URLs | High | Site URL + Redirect URLs for production domain in Supabase Dashboard |
| Update webhook URL | High | `NEXT_PUBLIC_APP_URL` → production URL so AssemblyAI can reach webhook |
| Rate limiting | Medium | Protect API routes (`/api/chat`, `/api/reports`, `/api/search`) from abuse |
| Error monitoring | Medium | Sentry or similar for production error tracking |
| Zero retention audit | Medium | Verify AssemblyAI + OpenAI data handling policies |
| Backup strategy | Low | Supabase daily backups + point-in-time recovery |
| Performance optimization | Low | Edge caching, image optimization, bundle analysis |

---

## 5. HOW TO START A NEW SESSION

Copy-paste this to bootstrap the new agent:

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

The database has 10 tables across 7 migrations. See ROADMAP.md for full task
history and architecture decisions.

Your immediate task is Phase 4: Production Deployment. Propose the approach first,
wait for approval before making changes.

CRITICAL: Do NOT break existing features. The admin client pattern, token_hash
auth, and SECURITY DEFINER RLS helpers are sacred — use them, don't replace them.
```
