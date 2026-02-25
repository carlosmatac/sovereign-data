# SOVEREIGN DATA — MASTER HANDOVER DOCUMENT & SYSTEM PROMPT

**Date**: February 14, 2026
**Repo**: `git@github.com:carlosmatac/sovereign-data.git`
**Branch**: `main` — 10 commits, latest `b855ca2`
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
| **Phase 1** | COMPLETE | Auth, upload, AssemblyAI transcription, GPT extraction, chunking, embeddings, search — full end-to-end pipeline verified working |
| **Phase 2** | PARTIALLY COMPLETE | Dashboard home page + Intelligence Chat (streaming RAG) working. Entity graph + topic heatmap NOT done |
| **Phase 2.5** | NOT STARTED | **Your immediate mission** — see Section 3 |
| **Phase 3** | NOT STARTED | Team management, reports |
| **Phase 4** | NOT STARTED | Production deployment |

### Database — 7 Tables, 3 Migrations Applied

| Table | Purpose |
|-------|---------|
| `profiles` | Extends auth.users (auto-created via trigger) |
| `projects` | RLS root, contains country/region |
| `project_members` | Many-to-many with roles (owner/editor/viewer) |
| `interviews` | Audio assets with status, transcript, summary, sentiment, topics |
| `interview_chunks` | Vector store, HNSW indexed (`vector(1536)`), speaker-aware |
| `entities` | Knowledge graph nodes (PERSON, COMPANY, GOVERNMENT, etc.) |
| `entity_mentions` | Entity ↔ interview links with sentiment |

Key SQL extensions: `vector` (not "pgvector"), `pg_trgm`, `uuid-ossp` — all in `extensions` schema.

### File Structure (57 source files)

```
src/
├── app/
│   ├── (auth)/login, auth/callback, auth/confirm
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx         # NEW: Stats, recent interviews, quick actions
│   │   ├── chat/page.tsx              # NEW: Streaming RAG conversation
│   │   ├── projects/, interviews/, search/, settings/
│   │   └── layout.tsx                 # Auth guard + sidebar
│   ├── api/
│   │   ├── chat/route.ts             # NEW: streamText + hybrid_search RAG
│   │   ├── interviews/route.ts       # Create + submit to AssemblyAI
│   │   ├── interviews/[id]/poll/route.ts  # Polling fallback (webhook can't reach localhost)
│   │   ├── search/route.ts           # Intent classification + hybrid_search
│   │   └── webhooks/transcription/route.ts
│   ├── layout.tsx, page.tsx (redirects to /dashboard)
├── components/
│   ├── dashboard/app-sidebar.tsx      # 6 nav items: Dashboard, Projects, Interviews, Search, Chat, Settings
│   ├── interviews/status-tracker.tsx  # Realtime + polling fallback
│   ├── interviews/transcript-viewer.tsx
│   └── ui/ (20 shadcn components)
├── lib/
│   ├── ai/assemblyai.ts, extraction.ts, chunking.ts, embeddings.ts, pipeline.ts
│   ├── supabase/client.ts, server.ts, admin.ts
│   └── constants.ts
├── types/database.ts                  # Full typed Database interface
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

## 3. IMMEDIATE MISSION: PHASE 2.5 (The "What")

### The Paradigm Shift

We are moving from a **Linear Ingestion Architecture** to a **Graph & Event-Driven Architecture**:

- **From Entities to Relationships (GraphRAG)**: It's not enough to know "Elon Musk" was mentioned. We need a Knowledge Graph showing WHO mentioned him, how they are connected (`relation_type`: "business_partner", "critic", "regulator", etc.), and the confidence score.
- **From Audio to Multi-modal**: The system architecture should prepare for `source_type` flexibility (audio today, PDFs/docs tomorrow).
- **From Search to "Push"**: The pipeline must proactively generate derivative content (marketing snippets) asynchronously without waiting for user prompts.

### CRITICAL CONSTRAINT
You must NOT break the existing Chat (`/chat`) or Dashboard (`/dashboard`) features. All new architecture must be additive or gracefully refactored. The existing 7 tables must remain intact — add new tables, add columns with defaults, but do not drop or rename existing columns.

### Objective 1: Database Evolution (Graph & Assets)

Update the Supabase schema to support:

- **Multi-modal ingestion prep**: Add `source_type` column to `interviews` (default `'audio'`, future values: `'document'`, `'video'`). This is additive — existing audio interviews continue working.
- **Explicit Entity Relationships**: New `entity_relationships` table mapping source entity → target entity with `relation_type` (enum: 'business_partner', 'competitor', 'regulator', 'critic', 'ally', 'subsidiary', 'investor', etc.), `confidence` score (0–1), `evidence_text` (the quote that establishes the relationship), and `interview_id` (provenance).
- **Marketing Content Snippets**: New `content_snippets` table storing auto-generated marketing assets per interview — `platform` (enum: 'linkedin', 'twitter', 'newsletter', 'summary'), `content` (the generated text), `tone` ('professional', 'casual', 'provocative'), `status` ('draft', 'approved', 'published').

**Provide the SQL migration and the conceptual approach first. Wait for approval before writing application code.**

### Objective 2: AI Pipeline Evolution

Modify the existing ETL pipeline (`src/lib/ai/pipeline.ts`) to:

1. **Extract relationships** during the entity extraction phase — update the Zod schema in `extraction.ts` to also return a `relationships` array (source_name, target_name, relation_type, confidence, evidence_text). Remember: all fields must be required (use `.nullable()` not `.optional()`).
2. **Post-processing step**: After the main pipeline reaches COMPLETED, trigger an async "content generation" step that uses GPT-4o-mini to generate marketing snippets (LinkedIn post, Twitter thread, newsletter blurb) from the interview summary + key quotes.
3. **Persist everything** to the new tables using the admin client pattern.

### Objective 3: UI Surfacing

- Update the **Interview Detail page** (`src/app/(dashboard)/interviews/[id]/page.tsx`) to display:
  - Marketing Assets section: generated snippets with copy-to-clipboard buttons, organized by platform
  - Entity Relationships: a visual or list representation showing who is connected to whom and how
- This should be additive — the existing summary, entities, sentiment, and transcript sections remain untouched.

---

## 4. FUTURE ROADMAP (What Comes Later)

Once Phase 2.5 is fully working and verified:

### Phase 3: Team Management & Investor-Grade Reports
- Email invite flow → `project_members` with roles (owner/editor/viewer)
- Role-based UI (viewers: read-only, editors: upload + edit, owners: full control)
- Report generator: select interviews/topics → GPT-4o generates structured BI report
- PDF export via `@react-pdf/renderer` or Puppeteer
- Report sharing with optional password protection

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

Current state: Phase 1 is COMPLETE (full audio ingestion pipeline working). Phase 2
is PARTIALLY COMPLETE (Dashboard and Intelligence Chat with streaming RAG are working).

Your immediate task is Phase 2.5: Evolve the architecture from linear ingestion to
Graph + Event-Driven. Start with Objective 1 (Database Evolution) — propose the SQL
migration and conceptual approach. Wait for approval before writing application code.

CRITICAL: Do NOT break the existing Chat (/chat) or Dashboard (/dashboard). All
changes must be additive. The admin client pattern, token_hash auth, and SECURITY
DEFINER RLS helpers are sacred — use them, don't replace them.
```
