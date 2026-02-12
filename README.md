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
| Auth | Supabase Auth | Magic Links, session management |
| Database | PostgreSQL 16 + pgvector | Relational data + vector search |
| Storage | Supabase Storage | Audio file hosting (S3 wrapper) |
| Transcription | AssemblyAI Universal-2 | Speaker diarization, accented speech |
| Extraction | OpenAI GPT-4o-mini | Structured intelligence extraction |
| Embeddings | OpenAI text-embedding-3-small | 1536-dim vectors for RAG |
| Search | Hybrid (SQL + HNSW) | Pre-filtered semantic search |

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (with pgvector enabled)
- AssemblyAI API key
- OpenAI API key

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# → Fill in your API keys

# Run the database migration
# (via Supabase Dashboard → SQL Editor, or Supabase CLI)

# Start development server
npm run dev
```

### Database Migration

Run the SQL in `supabase/migrations/00001_initial_schema.sql` against your Supabase project. This creates:

- `profiles` — User profiles (extends Supabase Auth)
- `projects` — Intelligence projects (RLS root)
- `project_members` — Access control
- `interviews` — Audio interview assets
- `interview_chunks` — Vector store (RAG search units)
- `entities` — Knowledge graph (people, companies, orgs)
- `entity_mentions` — Entity ↔ Interview relationships

All tables have **Row Level Security (RLS)** enabled.

## Security

- **RLS on all tables** — Users only see data from their assigned projects
- **Zero Data Retention** — AI providers configured for no training data retention
- **GDPR compliant** — EU data residency (Frankfurt)
- **Webhook verification** — Signed webhooks for AssemblyAI callbacks

## License

MIT
