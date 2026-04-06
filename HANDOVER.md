# SOVEREIGN DATA — HANDOVER DOCUMENT

**Date**: March 3, 2026  
**Repo**: `git@github.com:carlosmatac/sovereign-data.git`  
**Branch**: `main`  
**Runtime**: Next.js dev server on `http://localhost:3000`

> **Priorities & “what’s next”:** maintain with [`docs/roadmaps/active-workstreams.md`](./docs/roadmaps/active-workstreams.md) (short snapshot). **Per-feature** intent and implementation notes live under [`docs/features/`](./docs/features/README.md) (`to-do` / `on-going` / `done`). This handover stays the place for **continuity, gotchas, and constraints**. Agents: read [`AGENTS.md`](./AGENTS.md) first for workflow and doc precedence.

---

## 1. BUSINESS CONTEXT

**Sovereign Data** is a Frontier Markets Intelligence Platform for a media/consulting firm operating in the Global South. It transforms 60–90 minute exclusive interviews with Ministers, CEOs, and Diplomats into a searchable, AI-powered business intelligence database.

### Three Pillars

1. **Sales Intelligence (GraphRAG)** — Cross-project relationship mapping so salespeople can see who is connected to whom, with what sentiment. Directly increases deal closure rates.
2. **Editorial Strategy** — Data-driven trend detection across all interviews to inform market entry and editorial decisions. Architecture prepared for multi-modal ingestion (PDFs, prep docs).
3. **Push Marketing** — Auto-generated content (LinkedIn, Twitter, Newsletter) from processed interviews. Zero manual effort.

> For deep technical documentation on any system, see the [documentation map](./README.md#documentation-map) in README.md and [`docs/README.md`](./docs/README.md).

---

## 2. CURRENT STATE

### Phase Status

| Phase | Status |
|-------|--------|
| Phase 0: Foundation | COMPLETE |
| Phase 1: Auth & Core Pipeline | COMPLETE |
| Phase 2: Conversational RAG & Analytics | COMPLETE |
| Phase 2.5: Graph & Event-Driven Architecture | COMPLETE |
| Phase 3: Team Management & Reports | COMPLETE |
| Phase 3.5: Copilot Upgrades & War Room | COMPLETE |
| **Phase 4: Production Deployment** | **NOT STARTED** |

*The table above is a **historical phased snapshot**. It does not decide what the team works on this week — see [`active-workstreams.md`](./docs/roadmaps/active-workstreams.md).*

### What's Built

- Full audio ingestion pipeline (upload → transcribe → extract → resolve → chunk → normalize → embed → ground → graph)
- Two-stage extraction: raw intelligence extraction (GPT-4o-mini) → entity resolution with anchor-aware matching, description enrichment, and confidence tracking
- Anchor-aware chunk normalization (anchor enrichment for embeddings, conservative text replacement only at high confidence)
- Hybrid entity grounding (exact → alias → anchor_context → fuzzy) linking entity_mentions to specific chunks with evidence context
- Agentic RAG chat with TBY persona, Second-Order Thinking, and Tavily web search
- Dashboard with analytics (project breakdown, topic distribution)
- Network Explorer for entity relationships
- Team management with role-based access (owner/editor/viewer)
- AI report generator with shared intelligence layer (evidence provenance, entity hygiene, insight blocks, contradiction detection) and 5 templates (GPT-4o streaming)
- PDF export via `@react-pdf/renderer`
- Report sharing via public links with optional password protection
- Sales War Room (mock CRM data, ready for HubSpot integration)
- Entity Editor with alias learning (human-in-the-loop corrections)
- Transcript display layer with cleaned/original toggle

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.1.6 (App Router), TypeScript, Tailwind CSS v4, Shadcn/ui |
| Auth | Supabase Auth — Magic Links via `token_hash` flow |
| Database | Supabase PostgreSQL 16 + pgvector, 12 tables, 15 migrations |
| AI | Vercel AI SDK v6, GPT-4o-mini (extraction), GPT-4o (reports), `text-embedding-3-small` |
| Transcription | AssemblyAI Universal-2 |
| Web Search | Tavily (optional) |

**UI theme:** Default is **dark slate / navy-charcoal** (brand-aligned with logo `#0f172a` + white). Tokens live in `src/app/globals.css`; `next-themes` forces `dark` via `src/components/providers/app-theme-provider.tsx`.

---

## 3. CRITICAL GOTCHAS (Do NOT Violate)

1. **`auth.uid()` is NULL in PostgREST context** — All mutations use the "admin client pattern": verify user with `getUser()`, then use service role client for DB writes. This is the established architecture, not a bug.

2. **OpenAI structured outputs require ALL fields to be required** — No `.optional()` or `.default()` in Zod schemas passed to `generateObject`. Use `.nullable()` instead.

3. **AssemblyAI webhooks cannot reach localhost** — Polling fallback at `/api/interviews/[id]/poll` checks AssemblyAI directly and triggers the pipeline. Status tracker polls every 10s.

4. **Similarity threshold is 0.25** (not 0.7) — `text-embedding-3-small` returns cosine similarities in the 0.3–0.6 range. Configured in `AI_CONFIG` in `src/lib/constants.ts`.

5. **AI SDK v6 breaking changes** — `useChat` returns `{ messages, sendMessage, status, error }`. Messages use `.parts` array (not `.content`). Server uses `toUIMessageStreamResponse()`.

6. **Token_hash auth flow** — Email templates use `{{ .TokenHash }}`, client at `/auth/confirm` calls `verifyOtp({ token_hash, type })`. Do NOT switch to PKCE.

7. **SECURITY DEFINER helpers** — RLS policies use `is_project_member()`, `is_project_owner()`, etc. to avoid infinite recursion. See migration `00002`.

8. **Interview deletion uses CASCADE** — Deleting from `interviews` removes all chunks, mentions, relationships, and snippets. Audio is deleted from Storage separately.

9. **`stopWhen: stepCountIs(5)`** — AI SDK v6 replaced `maxSteps`. The `tool()` helper uses `inputSchema` (not `parameters`). Tavily is optional — if `TAVILY_API_KEY` is missing, tool returns graceful "unavailable" message.

---

## 4. Production deployment checklist (backlog only)

**Not** a current execution priority in [`active-workstreams.md`](./docs/roadmaps/active-workstreams.md). When the team **explicitly** decides to ship to production, typical work includes:

| Task | Priority | Description |
|------|----------|-------------|
| Deploy to Vercel | High | Connect repo, configure build settings (`next build` passes) |
| Production env vars | High | All API keys (Supabase, OpenAI, AssemblyAI) in Vercel Dashboard |
| Custom domain | High | Point domain to Vercel deployment |
| Update Supabase URLs | High | Site URL + Redirect URLs for production domain in Supabase Dashboard |
| Update webhook URL | High | `NEXT_PUBLIC_APP_URL` → production URL so AssemblyAI can reach webhook |
| Rate limiting | Medium | Protect `/api/chat`, `/api/reports`, `/api/search` from abuse |
| Error monitoring | Medium | Sentry or similar for production error tracking |
| Zero retention audit | Medium | Verify AssemblyAI + OpenAI data handling policies |
| Backup strategy | Low | Supabase daily backups + point-in-time recovery |
| Performance optimization | Low | Edge caching, image optimization, bundle analysis |

**Whether this is “next”** is a **product decision** — see [`active-workstreams.md`](./docs/roadmaps/active-workstreams.md) (deployment is explicitly *not* current execution there). When the team prioritizes go-live, consider adding a **feature spec** under [`docs/features/to-do/`](./docs/features/to-do/) so it follows the same lifecycle as other work. Legacy phased docs labeled Phase 4 as “not started”; that is **historical**, not an automatic mission.

---

## 5. ENVIRONMENT VARIABLES

```
NEXT_PUBLIC_SUPABASE_URL=<set>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<set>
SUPABASE_SERVICE_ROLE_KEY=<set>
ASSEMBLYAI_API_KEY=<set>
OPENAI_API_KEY=<set>
NEXT_PUBLIC_APP_URL=http://localhost:3000
WEBHOOK_SECRET=<set>
TAVILY_API_KEY=<set>  # Optional — web search disabled gracefully if missing
```

---

## 6. HOW TO START A NEW SESSION

Copy-paste this to bootstrap a new AI agent:

```
Read AGENTS.md, then HANDOVER.md, then docs/roadmaps/active-workstreams.md.
If I give you a feature spec, read docs/features/on-going/<file>.md or to-do/<file>.md next.
If I ask you to create a new feature spec, use docs/features/feature-spec-template.md as the structure.

For deep technical details, read only what your task needs, e.g.:

- docs/architecture/ingestion-pipeline.md — Ingestion / transcription / pipeline
- docs/architecture/agentic-rag.md — Copilot
- docs/infrastructure/database-schema.md — Multi-tenant DB, RLS
- docs/infrastructure/cost-model-finops.md — Cost model
- docs/features/done/human-in-the-loop.md — Entity Editor (shipped reference)
- docs/features/done/report-generation.md — Reports + PDF + sharing (shipped reference)
- docs/features/done/interview-transcript-review.md — Transcript review + reprocess (shipped reference)

Update the feature doc (and architecture docs if needed) as you implement — do not leave docs behind the code.

Do NOT treat docs/roadmaps/phased-delivery-history.md or intelligence-commercial-copilot.md
as the current task list unless I explicitly say so.

CRITICAL: Do NOT break existing features. The admin client pattern, token_hash
auth, and SECURITY DEFINER RLS helpers are sacred — use them, don't replace them.
```

---

## 7. CONSTRAINT REMINDER

Do NOT break the existing Chat (`/chat`), Dashboard (`/dashboard`), Network Explorer (`/network`), or Interview Detail pages. All new features must be additive. The admin client pattern, token_hash auth, and SECURITY DEFINER RLS helpers are sacred — use them, don't replace them.
