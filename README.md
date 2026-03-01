# Sovereign Data

**Frontier Markets Intelligence Platform** — Transform exclusive interviews with decision-makers into a searchable, AI-powered business intelligence database.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js 15 / Vercel)                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Projects  │  │Interviews│  │  Search   │  │   Settings    │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘  │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│  API LAYER                                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ /api/interviews  │  │ /api/webhooks/* │  │  /api/search   │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│  AI PIPELINE                                                     │
│  ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌───────────┐  │
│  │ AssemblyAI │→ │ GPT-4o-mini│→ │ Chunking │→ │ Embeddings│  │
│  │ Universal-2│  │ Extraction │  │ Speaker  │  │ OAI Small │  │
│  └────────────┘  └────────────┘  └──────────┘  └───────────┘  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Agentic RAG: hybrid_search + Tavily web search (tool use) │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│  SUPABASE                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Auth     │  │ Postgres │  │ pgvector │  │   Storage     │  │
│  │ MagicLink│  │ + RLS    │  │ HNSW     │  │   (Audio)     │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 15, Tailwind CSS, Shadcn/ui | App Router, RSC, modern UI |
| Auth | Supabase Auth | Magic Links (token_hash flow) |
| Database | PostgreSQL 16 + pgvector | Relational data + vector search |
| Storage | Supabase Storage | Audio file hosting (S3 wrapper) |
| Transcription | AssemblyAI Universal-2 | Speaker diarization, accented speech |
| Extraction | OpenAI GPT-4o-mini | Structured intelligence extraction |
| Embeddings | OpenAI text-embedding-3-small | 1536-dim vectors for RAG |
| Search | Hybrid (SQL + HNSW) | Pre-filtered semantic search |
| Web Search | Tavily Search API | Real-time web intelligence for Agentic RAG |

## Getting Started

See [SETUP.md](./SETUP.md) for the complete setup guide, including external service configuration and known issues.

### Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# → Fill in your Supabase, AssemblyAI, and OpenAI keys

# Run database migrations (see SETUP.md for details)
# Run storage setup (see SETUP.md for details)

# Start development server
npm run dev

# Reset database (wipe all data, keep schema + auth users)
npx tsx scripts/reset-database.ts
```

## Project Structure

```
src/
├── app/
│   ├── (auth)/              # Login + auth callback (no sidebar)
│   │   ├── login/           # Magic link login page
│   │   └── auth/
│   │       ├── callback/    # Server route: redirects to /auth/confirm
│   │       └── confirm/     # Client page: verifies token_hash, sets session
│   ├── (dashboard)/         # Authenticated app shell (with sidebar)
│   │   ├── projects/        # Project list, detail (Sales War Room), create
│   │   ├── interviews/      # Interview list, upload, detail view
│   │   ├── search/          # Hybrid RAG intelligence search
│   │   └── settings/        # Platform configuration
│   └── api/
│       ├── interviews/      # POST: create interview + trigger transcription
│       ├── search/          # POST: hybrid RAG search
│       └── webhooks/
│           └── transcription/ # AssemblyAI webhook callback
├── components/
│   ├── dashboard/           # App sidebar
│   ├── interviews/          # Status tracker, transcript viewer
│   └── ui/                  # Shadcn/ui components
├── lib/
│   ├── ai/                  # AI pipeline modules
│   │   ├── assemblyai.ts    # Transcription submission + polling
│   │   ├── extraction.ts    # GPT-4o-mini structured extraction
│   │   ├── chunking.ts      # Speaker-aware semantic chunking
│   │   ├── embeddings.ts    # OpenAI embedding generation
│   │   └── pipeline.ts      # Full ETL orchestrator
│   ├── supabase/            # Supabase client factories
│   │   ├── client.ts        # Browser client (uses anon key)
│   │   ├── server.ts        # Server Component client (cookie sessions)
│   │   └── admin.ts         # Service role client (bypasses RLS)
│   ├── mockHubspot.ts       # Mock CRM service (HubSpot-like deal data)
│   └── constants.ts         # App constants, AI config, status labels
├── types/
│   └── database.ts          # Full typed Supabase Database interface
└── middleware.ts             # Auth gate + session refresh

supabase/
├── migrations/
│   └── 00001_initial_schema.sql  # Full schema + RLS + hybrid_search()
├── setup-storage.sql              # Storage bucket + policies
└── enable-realtime.sql            # Realtime publication for interviews
```

## Security

- **RLS on all tables** — Users only see data from their assigned projects
- **Zero Data Retention** — AI providers configured for no training data retention
- **GDPR compliant** — EU data residency (Frankfurt)
- **Webhook verification** — Signed webhooks for AssemblyAI callbacks
- **Auth via token_hash** — No PKCE cookies, works cross-browser

## License

MIT
