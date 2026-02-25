# SOVEREIGN DATA — MASTER HANDOVER DOCUMENT & SYSTEM PROMPT

**Date**: February 25, 2026
**Repo**: `git@github.com:carlosmatac/sovereign-data.git`
**Branch**: `main` — latest `6177b3b`
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
| Orchestration | Vercel AI SDK v6 (`ai@^6.0.82`, `@ai-sdk/openai@^3.0.27`, `@ai-sdk/react`) | `streamText`, `generateObject`, `useChat` |
| Markdown | `react-markdown` | For chat response rendering |

### Phase Status

| Phase | Status | What's Done |
|-------|--------|-------------|
| **Phase 0** | COMPLETE | Scaffold, schema, typed clients, app shell |
| **Phase 1** | COMPLETE | Auth, upload, AssemblyAI transcription, GPT extraction (entities + relationships), chunking, embeddings, search — full end-to-end pipeline |
| **Phase 2** | COMPLETE | Dashboard (stats, project breakdown, topic distribution), Intelligence Chat (streaming RAG), Network Explorer (entity relationship browser), interview deletion |
| **Phase 2.5** | COMPLETE | Graph schema evolution (`entity_relationships`, `content_snippets`, `source_type`), relationship extraction in pipeline, auto-generated marketing snippets (LinkedIn, Twitter, Newsletter, Summary) |
| **Phase 3** | NOT STARTED | **Your immediate mission** — see Section 3 |
| **Phase 4** | NOT STARTED | Production deployment |

### Database — 9 Tables, 4 Migrations Applied

| Table | Purpose |
|-------|---------|
| `profiles` | Extends auth.users (auto-created via trigger) |
| `projects` | RLS root, contains country/region |
| `project_members` | Many-to-many with roles (owner/editor/viewer) |
| `interviews` | Audio assets with status, transcript, summary, sentiment, topics, `source_type` |
| `interview_chunks` | Vector store, HNSW indexed (`vector(1536)`), speaker-aware |
| `entities` | Knowledge graph nodes (PERSON, COMPANY, GOVERNMENT, etc.) |
| `entity_mentions` | Entity ↔ interview links with sentiment |
| `entity_relationships` | Graph edges: source→target with `relation_type`, `confidence`, `evidence_text`, interview provenance |
| `content_snippets` | Auto-generated marketing assets: `platform`, `content`, `tone`, `status` lifecycle |

Key SQL extensions: `vector` (not "pgvector"), `pg_trgm`, `uuid-ossp` — all in `extensions` schema.

### File Structure (~70 source files)

```
src/
├── app/
│   ├── (auth)/login, auth/callback, auth/confirm
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx         # Stats, project breakdown, topic distribution, quick actions
│   │   ├── chat/page.tsx              # Streaming RAG conversation
│   │   ├── network/page.tsx           # Entity relationship explorer (two-panel)
│   │   ├── projects/, interviews/, search/, settings/
│   │   └── layout.tsx                 # Auth guard + sidebar
│   ├── api/
│   │   ├── chat/route.ts             # streamText + hybrid_search RAG
│   │   ├── interviews/route.ts       # Create + submit to AssemblyAI
│   │   ├── interviews/[id]/route.ts  # DELETE interview (Storage + CASCADE)
│   │   ├── interviews/[id]/poll/route.ts  # Polling fallback
│   │   ├── search/route.ts           # Intent classification + hybrid_search
│   │   └── webhooks/transcription/route.ts
│   ├── layout.tsx, page.tsx (redirects to /dashboard)
├── components/
│   ├── dashboard/app-sidebar.tsx      # 7 nav items: Dashboard, Projects, Interviews, Search, Chat, Network, Settings
│   ├── interviews/status-tracker.tsx
│   ├── interviews/transcript-viewer.tsx
│   ├── interviews/copy-button.tsx     # Copy-to-clipboard (client component)
│   ├── interviews/delete-interview-button.tsx  # Delete with confirmation dialog
│   ├── network/network-explorer.tsx   # Interactive entity explorer (client component)
│   └── ui/ (20 shadcn components)
├── lib/
│   ├── ai/assemblyai.ts, extraction.ts, chunking.ts, embeddings.ts, pipeline.ts, content-generation.ts
│   ├── supabase/client.ts, server.ts, admin.ts
│   └── constants.ts
├── types/database.ts                  # Full typed Database interface (9 tables, 8 enums)
└── middleware.ts
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

### Environment Variables (`.env.local` — populated, gitignored)

```
NEXT_PUBLIC_SUPABASE_URL=https://pirgarfjqbymzqpgqjgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<set>
SUPABASE_SERVICE_ROLE_KEY=<set>
ASSEMBLYAI_API_KEY=<set>
OPENAI_API_KEY=<set>
NEXT_PUBLIC_APP_URL=http://localhost:3000
WEBHOOK_SECRET=<set>
```

---

## 3. IMMEDIATE MISSION: PHASE 3 — Team Management & Reports

### Objective 1: Team Member Invitation & Management

Build the multi-user collaboration layer using the existing `project_members` table:

- **Invite flow**: Project owner enters an email → a `project_members` row is created with role `'editor'` or `'viewer'` → an invite email is sent (use Supabase Auth invite or a custom email).
- **Member management page** (`/projects/[id]/members`): List current members, change roles, remove members. Only owners can manage members.
- **Role-based UI**: Viewers see read-only views (no upload, no edit). Editors can upload interviews and edit. Owners have full control including member management.
- Use the existing `is_project_member()`, `is_project_editor()`, `is_project_owner()` SECURITY DEFINER helpers.

### Objective 2: Report Generator

- **Report creation page**: User selects interviews and/or topics → GPT-4o (not mini — higher reasoning quality) generates a structured BI report.
- **Report templates**: Pre-built formats like "Country Risk Assessment", "Sector Analysis", "Entity Profile".
- **Report display page**: Rendered report with sections, sourced from interview data.
- Consider using `streamText` for streaming the report generation (reports can be long).

### Objective 3: PDF Export

- Generate downloadable PDF from report data.
- Options: `@react-pdf/renderer` (React components → PDF) or server-side Puppeteer (HTML → PDF).
- PDF should include report title, date, sections, citations, and a professional layout.

### Objective 4: Report Sharing (Optional/Low Priority)

- Shareable link with optional password protection.
- This requires a new `reports` table and a public route.

### CRITICAL CONSTRAINT
You must NOT break the existing Chat (`/chat`), Dashboard (`/dashboard`), Network Explorer (`/network`), or Interview Detail pages. All new features must be additive. The admin client pattern, token_hash auth, and SECURITY DEFINER RLS helpers are sacred — use them, don't replace them.

---

## 4. FUTURE ROADMAP (What Comes After Phase 3)

### Phase 4: Production Deployment & Security
- Deploy to Vercel, configure production env vars
- Custom domain + update Supabase URLs
- Update webhook URL to production (AssemblyAI can reach Vercel)
- Rate limiting, Sentry error monitoring
- Zero data retention audit (AssemblyAI + OpenAI)
- Supabase daily backups

---

## 5. HOW TO START A NEW SESSION

Copy-paste this to bootstrap the new agent:

```
Read the files HANDOVER.md and ROADMAP.md in the project root. HANDOVER.md is the
primary document — it contains the full business context, tech stack, architectural
constraints, known gotchas, and your immediate mission.

Current state: Phases 0, 1, 2, and 2.5 are ALL COMPLETE. The platform has:
- Full audio ingestion pipeline (upload → transcribe → extract entities &
  relationships → chunk → embed → generate marketing snippets)
- Streaming RAG chat with citations
- Dashboard with analytics (project breakdown, topic distribution)
- Network Explorer for entity relationships
- Interview deletion with CASCADE cleanup

The database has 9 tables across 4 migrations. See ROADMAP.md for full task
history and architecture decisions.

Your immediate task is Phase 3: Team Management & Reports. Start with Objective 1
(team member invitation and role-based UI) — propose the approach first, wait for
approval before writing code.

CRITICAL: Do NOT break existing features. The admin client pattern, token_hash
auth, and SECURITY DEFINER RLS helpers are sacred — use them, don't replace them.
```
