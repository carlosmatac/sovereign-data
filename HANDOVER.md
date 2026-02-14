# PROJECT STATE SNAPSHOT & HANDOVER

**Date**: February 14, 2026
**Repo**: `git@github.com:carlosmatac/sovereign-data.git`
**Latest commit**: `dcbb6b0` (6 commits on `main`)

---

## 1. PROJECT MANIFESTO (The "Why")

**Sovereign Data** is a Frontier Markets Intelligence Platform for a media/consulting firm operating in the Global South (Africa, LatAm, Asia). The firm conducts 60-90 minute exclusive interviews with Ministers, CEOs, and Diplomats. Currently, the intelligence in these audio files "dies" after the article is written.

**Core Value Prop:**
- **Audio-First BI**: Ingest audio → transcribe with speaker identification → extract structured intelligence → make it searchable.
- **Zero Data Retention**: AssemblyAI and OpenAI configured for zero training data retention.
- **GDPR Compliance**: Supabase hosted in EU (Frankfurt).
- **Monetization**: Internal editor efficiency + selling high-ticket BI reports to foreign investors.

**Hybrid Search Strategy (RAG):**
1. **Intent Classification**: LLM extracts metadata filters from the user query (country, topics).
2. **SQL Pre-filter**: Standard `WHERE` clauses reduce the search space to relevant chunks.
3. **Vector Similarity**: pgvector HNSW index finds semantically similar chunks within the filtered set.
4. **Synthesis**: Top chunks sent to LLM for answer generation with timestamped audio citations.

---

## 2. THE TECH STACK (Strict Constraints)

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | Next.js 15 (App Router), TypeScript | Turbopack, `src/` directory |
| **UI** | Tailwind CSS v4, `shadcn/ui`, `lucide-react` | 20 Shadcn components installed |
| **Auth** | Supabase Auth | Magic Links via token_hash flow (NOT PKCE) |
| **Database** | Supabase PostgreSQL 16 + `pgvector` | HNSW index, 1536 dimensions |
| **Storage** | Supabase Storage | `interview-audio` bucket, public read |
| **Transcription** | AssemblyAI | `speech_models: ["universal-2"]`, speaker diarization |
| **Extraction** | OpenAI GPT-4o-mini | Via Vercel AI SDK `generateObject` with Zod schemas |
| **Embeddings** | OpenAI text-embedding-3-small | 1536 dimensions, $0.02/1M tokens |
| **Orchestration** | Vercel AI SDK (`ai`, `@ai-sdk/openai`) | `generateObject` for structured outputs |

**Package versions (key):**
- `next@16.1.6`, `@supabase/supabase-js@2.95.3`, `@supabase/ssr@0.8.0`
- `ai` (Vercel AI SDK), `@ai-sdk/openai`, `zod`

---

## 3. ARCHITECTURE & DATA FLOW

### Async 3-Step Pipeline

```
Step 1: INGESTION (Upload & Forget)
  User uploads MP3 → Supabase Storage (browser client direct upload)
  → POST /api/interviews creates record (status: PROCESSING)
  → Submits audio URL to AssemblyAI with webhook callback
  → User sees real-time status tracker (Supabase Realtime)

Step 2: PROCESSING (Webhook-Driven ETL)
  AssemblyAI completes → POST /api/webhooks/transcription
  → Fetches full transcript with speaker diarization
  → GPT-4o-mini extracts: summary, sentiment, entities, topics, risks, opportunities
  → Speaker-aware chunking (~500 tokens, respects speaker turns)
  → OpenAI generates embeddings for each chunk

Step 3: PERSISTENCE
  → Chunks + embeddings → interview_chunks table (HNSW indexed)
  → Entities → entities + entity_mentions tables
  → Interview status → COMPLETED (Realtime pushes update to UI)
```

### Security Layer
- **RLS on all 7 tables** — project-scoped access via `SECURITY DEFINER` helper functions.
- **Admin client pattern**: Server-side mutations verify user with `getUser()`, then use service role client for DB writes (bypasses RLS safely).
- **Webhook verification**: `x-webhook-secret` header on AssemblyAI callbacks.

---

## 4. CURRENT INFRASTRUCTURE STATE

### Database — All Migrations Applied

Three migrations have been run on Supabase:

| Migration | What it does |
|-----------|-------------|
| `00001_initial_schema.sql` | 7 tables, all indexes, RLS policies, triggers, `hybrid_search()` function |
| `00002_fix_rls_recursion.sql` | `SECURITY DEFINER` helper functions, rewrites all policies |
| `00003_fix_created_by_default.sql` | `DEFAULT auth.uid()` on `created_by` columns |

**7 Tables:**
1. `profiles` — extends auth.users (auto-created on signup via trigger)
2. `projects` — RLS root, contains country/region
3. `project_members` — many-to-many with roles (owner/editor/viewer)
4. `interviews` — audio assets with status, transcript, summary, sentiment
5. `interview_chunks` — vector store, HNSW indexed (`vector(1536)`)
6. `entities` — knowledge graph (PERSON, COMPANY, GOVERNMENT, etc.)
7. `entity_mentions` — entity ↔ interview links with sentiment

**Key indexes:**
- `idx_chunks_embedding` — HNSW (m=16, ef_construction=64) on `vector_cosine_ops`
- `idx_chunks_metadata` — GIN on JSONB for pre-filter queries
- `idx_entities_name` — GIN trigram for fuzzy name search

**Storage:**
- Bucket `interview-audio` created (public read, auth upload, 500MB limit, audio MIME types only)

**Realtime:**
- `interviews` table added to `supabase_realtime` publication

### SQL Extension Fix (CRITICAL)
The original migration had `CREATE EXTENSION "pgvector"` which fails on Supabase. Fixed to:
```sql
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions"; -- MUST be before gin_trgm_ops index
```

---

## 5. ENVIRONMENT & CONFIGURATION (The "Gotchas")

### Port Issue
Port 3000 was occupied by another process during initial dev. The app started on port 3001 which broke auth callbacks. **Resolution**: Kill the process on 3000, always run on port 3000. Auth callback URLs are origin-dependent.

### Auth Flow — token_hash (NOT PKCE)
Default Supabase magic links use PKCE flow which stores a code verifier cookie. This fails when the user clicks the link in a different browser (email client).

**Our fix:**
- Supabase email templates customized to use `{{ .TokenHash }}` directly:
  ```
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink">Sign In</a>
  ```
- Client page `/auth/confirm` calls `supabase.auth.verifyOtp({ token_hash, type })` — no PKCE cookie needed.
- Works in any browser/device.

### auth.uid() NULL in PostgREST
Both browser client and server client's PostgREST calls have `auth.uid() = NULL` even when `getUser()` succeeds. This is a `@supabase/ssr` cookie-JWT propagation issue.

**Our pattern for ALL mutations:**
```typescript
// 1. Verify identity via cookie-based client
const supabase = await createClient(); // server client
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Not authenticated" };

// 2. Use admin client for the actual DB write
const admin = createAdminClient(); // service_role, bypasses RLS
await admin.from("table").insert({ ..., created_by: user.id });
```

### API Keys (`.env.local` — populated, gitignored)
```
NEXT_PUBLIC_SUPABASE_URL=https://pirgarfjqbymzqpgqjgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<set>
SUPABASE_SERVICE_ROLE_KEY=<set>
ASSEMBLYAI_API_KEY=<set>
OPENAI_API_KEY=<set>
NEXT_PUBLIC_APP_URL=http://localhost:3000
WEBHOOK_SECRET=<set>
```

### Supabase Dashboard Config
- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: `http://localhost:3000/**`
- **Email Templates**: Magic Link and Confirm Signup customized with `token_hash` (see SETUP.md Section 3.5)

---

## 6. CURRENT APP STATUS & WHAT WORKS

### Working (Tested)
- Login via magic link (token_hash flow)
- Dashboard navigation (sidebar, all pages render)
- Project creation (Server Action + admin client)
- Audio upload to Supabase Storage (works, file lands in bucket)

### Last Bug — JUST FIXED (Not Yet Tested by User)
**AssemblyAI transcription submission** was failing because:
1. First attempt: missing `speech_model` param (API changed in 2026)
2. Second attempt: used `speech_model` (singular) but API wants `speech_models` (plural, array)
3. **Fix applied in commit `dcbb6b0`**: `speech_models: ["universal-2"]`

The interview record IS created in the DB (status: FAILED) but AssemblyAI never starts transcription. Once the user retries the upload, the full pipeline should work.

### Not Yet Tested
- Full ETL pipeline (AssemblyAI webhook → extraction → chunking → embedding)
- Interview detail page with completed data
- Intelligence Search (RAG)
- Real-time status updates via Supabase Realtime

---

## 7. IMMEDIATE ROADMAP (Next Steps)

### Priority 1: Verify Upload Pipeline Works End-to-End
The AssemblyAI `speech_models` fix is deployed. User needs to:
1. Upload an audio file again
2. Verify AssemblyAI accepts it and starts transcription
3. Verify the webhook hits `/api/webhooks/transcription`
4. Watch the full ETL pipeline complete

**Potential blocker**: The webhook URL is `http://localhost:3000/api/webhooks/transcription`. AssemblyAI cannot reach localhost. For production this needs a public URL (Vercel deployment or ngrok tunnel for dev). This hasn't been tested yet and will likely be the next issue.

### Priority 2: Fix Webhook Reachability
Options:
- Deploy to Vercel (production path)
- Use `ngrok` or Vercel CLI `vercel dev` for local development
- Poll AssemblyAI instead of using webhooks (fallback)

### Priority 3: Test & Debug Full Pipeline
Once transcription completes, verify:
- Transcript extraction and structured intelligence (GPT-4o-mini)
- Chunk generation and embedding
- Data persistence in all tables
- Interview detail page rendering the results
- Search functionality

---

## 8. FILE STRUCTURE (53 Source Files)

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx              # Magic link login
│   │   └── auth/
│   │       ├── callback/route.ts       # Server: forwards params to confirm
│   │       └── confirm/page.tsx        # Client: verifyOtp with token_hash
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # Auth guard + sidebar shell
│   │   ├── projects/
│   │   │   ├── page.tsx                # Project list grid
│   │   │   ├── new/page.tsx            # Create project form
│   │   │   └── actions.ts             # Server Action: createProject (admin client)
│   │   ├── interviews/
│   │   │   ├── page.tsx                # Interview list with status badges
│   │   │   ├── upload/page.tsx         # Upload form: drag-drop, Storage upload, triggers API
│   │   │   └── [id]/page.tsx           # Detail: summary, entities, transcript, sentiment
│   │   ├── search/page.tsx             # RAG search UI with results
│   │   └── settings/page.tsx           # Platform config display
│   ├── api/
│   │   ├── interviews/route.ts         # POST: create + submit to AssemblyAI (admin client)
│   │   ├── search/route.ts             # POST: intent classify → hybrid_search → results
│   │   └── webhooks/transcription/route.ts  # AssemblyAI webhook → ETL pipeline
│   ├── layout.tsx                      # Root: fonts, Toaster, TooltipProvider
│   └── page.tsx                        # Redirect to /projects
├── components/
│   ├── dashboard/app-sidebar.tsx       # Sidebar nav + user dropdown
│   ├── interviews/
│   │   ├── status-tracker.tsx          # Real-time pipeline progress (Supabase Realtime)
│   │   └── transcript-viewer.tsx       # Speaker-colored, searchable transcript
│   └── ui/                             # 20 Shadcn components
├── lib/
│   ├── ai/
│   │   ├── assemblyai.ts              # Submit + fetch transcription
│   │   ├── extraction.ts              # GPT-4o-mini structured extraction (Zod schema)
│   │   ├── chunking.ts                # Speaker-aware semantic chunking
│   │   ├── embeddings.ts              # OpenAI batch embedding generation
│   │   └── pipeline.ts                # Full ETL orchestrator
│   ├── supabase/
│   │   ├── client.ts                  # Browser client (anon key)
│   │   ├── server.ts                  # Server client (cookie sessions)
│   │   └── admin.ts                   # Service role client (bypasses RLS)
│   └── constants.ts                   # Status labels, regions, AI config
├── types/database.ts                  # Full Supabase Database type (Row/Insert/Update)
└── middleware.ts                      # Auth gate, session refresh
```

---

## 9. INSTRUCTIONS FOR THE NEW AI AGENT

You are the senior developer inheriting this project. The foundation is solid — 53 TypeScript files, full database schema with RLS, complete AI pipeline code, and a working auth flow. Do not reinvent the wheel. Trust the schema, trust the types, trust the architecture.

**Key principles established:**
- All DB mutations go through admin client after `getUser()` verification
- Auth uses `token_hash` flow (NOT PKCE) — do not change this
- AssemblyAI requires `speech_models: ["universal-2"]` (plural, array)
- The `SECURITY DEFINER` helper functions (`is_project_member`, `is_project_owner`, etc.) are the foundation of all RLS policies — use them

**Your immediate task**: Help the user test the upload pipeline end-to-end. The `speech_models` fix was just deployed but not yet tested. The biggest likely blocker is that **AssemblyAI webhooks cannot reach localhost** — you'll need to solve this with ngrok, Vercel deploy, or a polling fallback.

**Read these files first:**
1. `SETUP.md` — complete setup guide with all known issues
2. `src/lib/ai/pipeline.ts` — the ETL orchestrator
3. `src/app/api/webhooks/transcription/route.ts` — webhook handler
4. `src/types/database.ts` — the typed Database interface
