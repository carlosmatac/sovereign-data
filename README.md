# Sovereign Data

**Intelligence platform** for turning **interviews, transcripts, PDFs/documents**, and internal knowledge into **meeting-prep context**, **grounded answers** on companies/sectors/themes, and **structured intelligence** for follow-up and reuse.

---

## Read this first

| If you are… | Start here |
|-------------|------------|
| **New to the repo** | [`README.md`](./README.md) (this page) → [`SETUP.md`](./SETUP.md) |
| **Continuing work / handoff** | [`HANDOVER.md`](./HANDOVER.md) → [`docs/roadmaps/active-workstreams.md`](./docs/roadmaps/active-workstreams.md) |
| **A Cursor agent** | [`AGENTS.md`](./AGENTS.md) → [`HANDOVER.md`](./HANDOVER.md) → [`active-workstreams`](./docs/roadmaps/active-workstreams.md) → feature spec in [`docs/features/on-going/`](./docs/features/on-going/) or [`to-do/`](./docs/features/to-do/) if applicable → narrow topic docs under `docs/` |

**Execution truth:** priorities and “what’s next” live in [`HANDOVER.md`](./HANDOVER.md) and [`docs/roadmaps/active-workstreams.md`](./docs/roadmaps/active-workstreams.md) — not in legacy roadmap archives.

---

## What Sovereign does

Sovereign supports media, consulting, and research teams working in **emerging markets**. It ingests long-form sources, extracts **entities, relationships, sentiment, and topics**, and exposes them through **search**, **Intelligence Chat**, **Network Explorer**, and **reports**.

### Core capabilities

- **Ingestion pipeline** — Audio (e.g. AssemblyAI) and **PDF/document** paths; transcription, extraction, chunking, embeddings, grounding, graph
- **Agentic RAG chat** — Hybrid internal retrieval + tools (e.g. entity/relationship traversal, optional web search)
- **Knowledge graph** — Cross-project relationships with evidence and confidence
- **Transcript review / human review** — Corrected utterances, seed entities, safe reprocessing
- **Human-in-the-loop** — Entity editor, aliases, merges
- **Reports** — Templated generation, PDF export, sharing
- **Team & access** — Roles (owner/editor/viewer), invitations

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Shadcn/ui |
| Auth | Supabase Auth (magic links via `token_hash` flow) |
| Database | PostgreSQL 16 + pgvector (Supabase), RLS |
| AI | Vercel AI SDK v6, OpenAI (extraction, embeddings, reports) |
| Transcription | AssemblyAI (e.g. Universal-2) |
| Web search | Tavily (optional) |
| PDF | `@react-pdf/renderer` where applicable |

## Getting started

See **[`SETUP.md`](./SETUP.md)** for environment variables, shared Supabase project usage, and verification.

```bash
npm install
# Configure .env.local per SETUP.md
npm run dev
```

---

## Documentation map

| Document | Purpose |
|----------|---------|
| **[`AGENTS.md`](./AGENTS.md)** | How Cursor agents should work; doc precedence; flexible branching guidance |
| **[`HANDOVER.md`](./HANDOVER.md)** | Operational continuity, gotchas, env list, sacred architecture patterns |
| **[`SETUP.md`](./SETUP.md)** | Local onboarding and machine setup |
| **[`docs/roadmaps/active-workstreams.md`](./docs/roadmaps/active-workstreams.md)** | **Short** execution snapshot (points at feature lifecycle dirs) |
| **[`docs/features/README.md`](./docs/features/README.md)** | Feature lifecycle (`to-do` / `on-going` / `done`) |
| **[`docs/features/feature-spec-template.md`](./docs/features/feature-spec-template.md)** | Default structure for new feature specs |
| **[`ROADMAP.md`](./ROADMAP.md)** | Pointer only — links legacy and planning roadmaps (not operative truth) |
| **[`docs/README.md`](./docs/README.md)** | Index of everything under `docs/` |

### Architecture

| Document | Description |
|----------|-------------|
| [Ingestion pipeline](./docs/architecture/ingestion-pipeline.md) | End-to-end ingestion and human review layer |
| [Agentic RAG](./docs/architecture/agentic-rag.md) | Intelligence Chat, retrieval, tools |

### Infrastructure

| Document | Description |
|----------|-------------|
| [Database schema](./docs/infrastructure/database-schema.md) | Tables, RLS, multi-tenant design |
| [Cost model & FinOps](./docs/infrastructure/cost-model-finops.md) | Per-service costs and levers |

### Features (lifecycle)

New work: author specs in [`docs/features/to-do/`](./docs/features/to-do/), move to [`on-going/`](./docs/features/on-going/) while building, then [`done/`](./docs/features/done/) when validated — see [`docs/features/README.md`](./docs/features/README.md).

**Shipped specs (reference):** [`docs/features/done/README.md`](./docs/features/done/README.md)

### Roadmaps (reference)

| Document | Description |
|----------|-------------|
| [Active workstreams](./docs/roadmaps/active-workstreams.md) | **Use this for current priorities** |
| [Phased delivery history](./docs/roadmaps/phased-delivery-history.md) | **Legacy** — phased checklist through 3.x / Phase 4 ideas |
| [Intelligence commercial copilot](./docs/roadmaps/intelligence-commercial-copilot.md) | **Planning** — CEO-demo path, P1–P6, hardening backlog |

### Workflows

| Document | Description |
|----------|-------------|
| [docs/workflows/README.md](./docs/workflows/README.md) | Placeholder index for human workflow notes |

---

## Project structure

```
src/
├── app/
│   ├── (auth)/                # Login + auth callback
│   ├── (dashboard)/           # Authenticated app (sidebar layout)
│   │   ├── dashboard/
│   │   ├── chat/
│   │   ├── network/
│   │   ├── projects/
│   │   ├── interviews/
│   │   ├── reports/
│   │   └── …
│   ├── shared/                # Public shared reports (no auth)
│   └── api/                   # Route handlers
├── components/
├── lib/                       # AI pipeline, entities, Supabase, etc.
├── types/database.ts
└── middleware.ts              # Auth gate + session refresh

supabase/
├── migrations/
├── setup-storage.sql
└── enable-realtime.sql
```

---

## Security

- **RLS** on tenant data — project-scoped access
- **Webhook verification** for transcription callbacks
- **Auth** — `token_hash` magic links (see `HANDOVER.md`)
- Provider / retention policies — confirm with your compliance owner

## License

MIT
