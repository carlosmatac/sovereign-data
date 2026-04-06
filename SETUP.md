# Sovereign Data — Local setup (shared project)

Guide for a **second developer machine** working against the **same** Supabase project, database, and third-party APIs as the rest of the team. This is **not** a “greenfield” or solo project bootstrap.

---

## Quick start

1. Install **Git**, **Node.js 20+**, and **npm** (10+ ships with current Node 20).
2. Clone the repo and run `npm install`.
3. Create **`.env.local`** using the variable list below; paste **real values supplied by the project lead** (do not mint new API keys or a new Supabase project).
4. Run `npm run dev` → open `http://localhost:3000` (use the same port as in your env unless the team agrees otherwise).
5. Sign in with magic link; confirm you can reach the dashboard and a project you’ve been added to.

For behaviour gotchas (auth, RLS, webhooks, AI SDK), read [`HANDOVER.md`](./HANDOVER.md). Priorities live in [`docs/roadmaps/active-workstreams.md`](./docs/roadmaps/active-workstreams.md). Cursor agents: read [`AGENTS.md`](./AGENTS.md) first. Deep docs: [`docs/README.md`](./docs/README.md).

---

## What the project lead supplies (you do not create these)

Your lead should give you, out of band:

| Item | Why |
|------|-----|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Same Supabase project as everyone else |
| `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY` | Same provider accounts / keys the app already uses |
| `WEBHOOK_SECRET` | Must match the value AssemblyAI sends in the **`x-webhook-secret`** header (same secret the API passes when submitting jobs) |
| `TAVILY_API_KEY` (optional) | Enables web search in Copilot; app degrades gracefully if omitted |
| Access to the **Supabase project** (Dashboard) | Only if you need to run SQL migrations or operational scripts |
| **Auth URL allow-list** | Supabase **Authentication → URL Configuration** must already include your dev origin (e.g. `http://localhost:3000/**`). If your machine uses another port or host, the lead must add it |
| **Project membership** | After you sign up/sign in, an **owner** must add you to the relevant **project(s)** in the app; otherwise you will see no tenant data |

---

## What you do **not** need to do

- Create a **new Supabase project** or database.
- Sign up for **new** OpenAI, AssemblyAI, or Tavily accounts **for this task** (unless the lead explicitly asks you to use separate keys later).
- **Provision** new infrastructure (Vercel, domains, etc.) unless the team prioritizes it — see [`HANDOVER.md`](./HANDOVER.md) §4 and [`active-workstreams.md`](./docs/roadmaps/active-workstreams.md).
- Re-run the **full** migration history on the shared database **unless** the team is applying a **new** migration file from the repo (see below). The shared project should already be migrated.
- Change Supabase **email templates** or auth model — the app relies on the **`token_hash`** magic-link flow; that is owned by whoever admins the shared Supabase project.

---

## Prerequisites

| Tool | Notes |
|------|--------|
| **Git** | SSH or HTTPS clone per your team |
| **Node.js** | **20.x LTS** recommended (`next build` has been verified on Node 20; use 18+ only if your team standardizes on it — if `npm run build` fails, align with Node 20) |
| **npm** | **10+** (comes with Node 20) |

Optional: a TypeScript-aware editor (VS Code / Cursor).

This repo does **not** use the Supabase CLI for local Postgres; the app talks to the **hosted** Supabase project via env vars.

---

## Clone and install

```bash
git clone git@github.com:carlosmatac/sovereign-data.git
cd sovereign-data
npm install
```

(Use your team’s actual remote URL if it differs.)

---

## Environment variables

Create a file named **`.env.local`** in the repo root. It is gitignored — never commit it.

There may be a **`.env.local.example`** in some working trees, but it is currently covered by `.env*` in `.gitignore`, so **after a fresh clone you might not have that file**. Use this template:

```bash
# --- Supabase (shared project) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- AssemblyAI ---
ASSEMBLYAI_API_KEY=

# --- OpenAI ---
OPENAI_API_KEY=

# --- Tavily (optional — web search in /chat) ---
TAVILY_API_KEY=

# --- App URL (webhook callback base URL; use your real dev origin) ---
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- Webhook HMAC secret (must match team / AssemblyAI config) ---
WEBHOOK_SECRET=
```

| Variable | Required | Used for |
|----------|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase client (browser + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only admin client after `getUser()` checks |
| `OPENAI_API_KEY` | Yes | Embeddings + LLM calls |
| `ASSEMBLYAI_API_KEY` | Yes | Transcription |
| `WEBHOOK_SECRET` | Yes | Compared to AssemblyAI’s `x-webhook-secret` header on `POST /api/webhooks/transcription` |
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL passed when creating transcriptions (webhook URL construction) |
| `TAVILY_API_KEY` | No | Tavily tool in chat; omitted → friendly “unavailable” message |

---

## Database and migrations

All schema lives in **`supabase/migrations/`**. On the **shared** Supabase project, migrations should **already** be applied in **lexicographic filename order**.

Current numbered files (verify after `git pull` — list may grow):

`00001_initial_schema.sql` → `00002_fix_rls_recursion.sql` → `00003_fix_created_by_default.sql` → `00004_graph_and_content.sql` → `00005_team_invitation_support.sql` → `00006_reports.sql` → `00007_report_sharing.sql` → `00008_expected_speakers.sql` → `00009_entity_normalization.sql` → `00010_interview_primary_entities.sql` → `00011_transcript_display.sql` → `00012_interview_scoped_search.sql` → `00013_interview_transcript_review.sql`

**Typical developer:** you do **nothing** here except stay in sync with `main` and ask the lead if a **new** migration appears — whoever has Dashboard access runs the new SQL in the **Supabase SQL Editor** once for the shared project.

One-off scripts (not automatic migrations):

| Path | Purpose |
|------|--------|
| `supabase/setup-storage.sql` | Storage bucket + policies (already applied on shared project) |
| `supabase/enable-realtime.sql` | Realtime for `interviews` (already applied on shared project) |
| `supabase/migrations/scripts/reset-interview-derived-data.sql` | **Destructive** data reset for interviews/entities/reports (Spanish comments; coordinate before use) |

Schema reference: [`docs/infrastructure/database-schema.md`](./docs/infrastructure/database-schema.md).

---

## Run the app locally

```bash
npm run dev
```

Default URL: **`http://localhost:3000`** (Next.js default). Keep **`NEXT_PUBLIC_APP_URL`** consistent with the origin you actually use, or webhook URLs and auth redirects can misbehave.

Other scripts:

| Command | Purpose |
|---------|--------|
| `npm run build` | Production build + typecheck (good sanity check) |
| `npm run start` | Serve the last build |
| `npm run lint` | ESLint |

---

## After the server starts

1. Open the app → you should hit **`/login`** (or equivalent auth entry).
2. Request a magic link with your email. If the lead configured Supabase with **`token_hash`** templates, the link should work even if opened in another browser tab (see [`HANDOVER.md`](./HANDOVER.md)).
3. Confirm you can open **`/dashboard`**, **`/projects`**, **`/chat`**, etc., according to your **project role** (owner / editor / viewer).

**AssemblyAI webhooks vs localhost:** callbacks to `/api/webhooks/transcription` generally **cannot** reach your laptop. The app includes a **polling** path (`/api/interviews/[id]/poll` and UI polling) so local dev can still progress — see [`HANDOVER.md`](./HANDOVER.md).

---

## Optional maintenance commands (dangerous — team approval only)

These can **delete or wipe shared data**. Do **not** run against the shared project without explicit agreement.

```bash
# Wipes projects, interviews, graph data, reports, storage audio — preserves auth users
npx tsx scripts/reset-database.ts
```

Requires **`dotenv`** (currently available via a transitive dev dependency when `npm install` has been run). If the script fails to resolve `dotenv`, install it locally or ask the team.

---

## Verify your setup

- [ ] `npm install` completes with no errors.
- [ ] `.env.local` exists and has **no** empty required variables.
- [ ] `npm run build` succeeds (catches many env/type issues).
- [ ] `npm run dev` serves **`http://localhost:3000`** (or your configured port).
- [ ] Magic link login completes and session persists across navigation.
- [ ] You see **projects** after an owner adds you; opening **Copilot** works; optional: Tavily-dependent behaviour if `TAVILY_API_KEY` is set.

---

## Troubleshooting

| Symptom | Likely cause | What to try |
|---------|----------------|-------------|
| `PKCE code verifier not found` after clicking email link | Supabase still on default PKCE magic link | Lead must use **`token_hash`** templates; see [`HANDOVER.md`](./HANDOVER.md) §3.5 / old SETUP §3.5 narrative |
| Redirect loop or “invalid redirect” | Dev URL not in Supabase allow-list | Lead adds `http://localhost:3000/**` (or your exact origin) under **Authentication → URL Configuration** |
| App runs but no data | Not a project member | Ask an owner to add you in **Project members** |
| `infinite recursion` / RLS errors when self-provisioning DB | Migrations incomplete | Not expected on shared project; lead should confirm `00002_fix_rls_recursion.sql` applied |
| Transcription stuck / no webhook | Localhost not reachable by AssemblyAI | Use UI polling; see [`HANDOVER.md`](./HANDOVER.md) |
| Dev server on **3001** | Port 3000 busy | Free port 3000 or set dev port **and** align `NEXT_PUBLIC_APP_URL` + Supabase redirect URLs with the lead |
| Build fails on older Node | Next 16 expectations | Switch to **Node 20 LTS** |

---

## Further reading

- [`AGENTS.md`](./AGENTS.md) — Cursor agent workflow and doc precedence
- [`HANDOVER.md`](./HANDOVER.md) — business context, env list, **critical gotchas**
- [`docs/roadmaps/active-workstreams.md`](./docs/roadmaps/active-workstreams.md) — short execution snapshot
- [`docs/features/README.md`](./docs/features/README.md) — feature specs lifecycle
- [`README.md`](./README.md) — project entrypoint and documentation map
- [`docs/README.md`](./docs/README.md) — index under `docs/`
- [`docs/architecture/ingestion-pipeline.md`](./docs/architecture/ingestion-pipeline.md) — ingestion pipeline
- [`docs/architecture/agentic-rag.md`](./docs/architecture/agentic-rag.md) — Copilot
