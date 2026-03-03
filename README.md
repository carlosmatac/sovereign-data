# Sovereign Data

**Frontier Markets Intelligence Platform** — Transform exclusive interviews with decision-makers into a searchable, AI-powered business intelligence database.

---

## What Is Sovereign?

Sovereign is an internal intelligence engine for media/consulting firms operating in emerging markets. It ingests 60–90 minute audio interviews with Ministers, CEOs, and Diplomats, then extracts entities, relationships, sentiment, and topics — building a queryable knowledge graph with an AI-powered chat interface.

### Core Capabilities

- **Audio Ingestion Pipeline** — Upload → AssemblyAI transcription → GPT-4o-mini extraction → pgvector embeddings
- **Agentic RAG Chat** — Conversational intelligence with tool calling (entity lookup, relationship traversal, Tavily web search)
- **Knowledge Graph** — Cross-project entity relationships with confidence scores and evidence provenance
- **AI Report Generator** — 5 templates powered by GPT-4o streaming, with PDF export and password-protected sharing
- **Team Management** — Role-based access (owner/editor/viewer) with email invitations
- **Sales War Room** — Project-level revenue tracking and pipeline health (CRM-ready)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Shadcn/ui |
| Auth | Supabase Auth (Magic Links via `token_hash` flow) |
| Database | PostgreSQL 16 + pgvector (HNSW), Supabase |
| Transcription | AssemblyAI Universal-2 (speaker diarization) |
| AI Extraction | OpenAI GPT-4o-mini (Vercel AI SDK v6) |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dimensions) |
| Web Search | Tavily Search API (optional) |
| PDF Export | `@react-pdf/renderer` |

## Getting Started

See [SETUP.md](./SETUP.md) for the complete setup guide.

```bash
npm install
cp .env.local.example .env.local
# Fill in Supabase, AssemblyAI, OpenAI, and optionally Tavily keys
npm run dev
```

## Documentation Hub

Deep technical documentation lives in the `docs/` directory. Each file is self-contained — AI agents and developers can read a specific file to understand a feature without needing the entire project context.

### Architecture

| Document | Description |
|----------|-------------|
| [Ingestion Pipeline](./docs/architecture/ingestion-pipeline.md) | 10-step audio upload → transcription → extraction → embedding → knowledge graph flow |
| [Agentic RAG](./docs/architecture/agentic-rag.md) | Intelligence Chat: hybrid search, tool calling, system prompt, Tavily web search |

### Infrastructure

| Document | Description |
|----------|-------------|
| [Database Schema](./docs/infrastructure/database-schema.md) | 10 tables, multi-tenant design, RLS policies, entity canonical merges, migration history |
| [Cost Model & FinOps](./docs/infrastructure/cost-model-finops.md) | Per-service cost breakdown, scale scenarios, optimization levers |

### Features

| Document | Description |
|----------|-------------|
| [Human-in-the-Loop](./docs/features/human-in-the-loop.md) | Entity Editor: rename vs. merge flows, alias learning, downstream effects |
| [Report Generation](./docs/features/report-generation.md) | GPT-4o streaming reports, PDF export, password-protected sharing |

### Root Files

| Document | Description |
|----------|-------------|
| [HANDOVER.md](./HANDOVER.md) | Active handover notes, critical gotchas, Phase 4 deployment plan |
| [ROADMAP.md](./ROADMAP.md) | Full phase history and architecture decisions |
| [SETUP.md](./SETUP.md) | Environment setup, external service configuration |

## Project Structure

```
src/
├── app/
│   ├── (auth)/                # Login + auth callback
│   ├── (dashboard)/           # Authenticated app (sidebar layout)
│   │   ├── dashboard/         # Analytics home
│   │   ├── chat/              # Intelligence Chat (Agentic RAG)
│   │   ├── network/           # Entity relationship explorer
│   │   ├── projects/          # Projects + Sales War Room
│   │   ├── interviews/        # Upload, list, detail
│   │   ├── reports/           # Generate, view, export, share
│   │   └── search/            # Hybrid RAG search
│   ├── shared/                # Public shared reports (no auth)
│   └── api/                   # Route handlers
├── components/                # React components (Shadcn/ui + custom)
├── lib/
│   ├── ai/                    # Pipeline modules (AssemblyAI, extraction, chunking, embeddings, RAG)
│   ├── entities/              # Entity matching + normalization
│   ├── pdf/                   # React PDF renderer
│   ├── supabase/              # Client factories (browser, server, admin)
│   └── constants.ts           # AI config, templates, labels
├── types/database.ts          # Full typed Supabase Database interface
└── middleware.ts              # Auth gate + session refresh

supabase/
├── migrations/                # 11 migration files (00001–00011)
├── setup-storage.sql          # Storage bucket + policies
└── enable-realtime.sql        # Realtime publication
```

## Security

- **RLS on all tables** — Users only see data from their assigned projects
- **Zero Data Retention** — AI providers configured for no training data retention
- **GDPR compliant** — EU data residency (Frankfurt)
- **Webhook verification** — Signed webhooks for AssemblyAI callbacks
- **Auth via token_hash** — Cross-browser compatible, no PKCE cookies

## License

MIT
