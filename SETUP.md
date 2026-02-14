# Sovereign Data — Setup Guide

Complete guide to configure the Frontier Markets Intelligence Platform from scratch.

---

## 1. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Runtime |
| npm | 10+ | Package manager |
| Supabase account | Free tier works | Database, Auth, Storage |
| AssemblyAI account | Pay-as-you-go | Audio transcription |
| OpenAI account | Pay-as-you-go | Extraction + embeddings |

---

## 2. Environment Variables

```bash
cp .env.local.example .env.local
```

Fill in all values in `.env.local`. See below for where to find each key.

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard > Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API > `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API > `service_role` key (keep secret!) |
| `ASSEMBLYAI_API_KEY` | [assemblyai.com](https://www.assemblyai.com/app) > Account > API Key |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) > API Keys |
| `WEBHOOK_SECRET` | Generate with: `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for dev, your Vercel URL for prod |

---

## 3. Supabase Setup

### 3.1 Create Project

1. Go to [supabase.com](https://supabase.com) > New Project
2. **Region**: Choose EU (Frankfurt) for GDPR compliance
3. Save the database password securely

### 3.2 Run Database Migration

1. Go to **SQL Editor** in the Supabase Dashboard
2. Paste and run the contents of `supabase/migrations/00001_initial_schema.sql`
3. This creates all tables, indexes, RLS policies, triggers, and the `hybrid_search()` function

**Known issue**: The original migration used `CREATE EXTENSION "pgvector"` which fails on Supabase. The correct extension name is `"vector"`. The `pg_trgm` extension must also be created **before** the `entities` table index that uses `gin_trgm_ops`. The current migration file has these fixes applied.

### 3.3 Run Storage Setup

1. In the SQL Editor, run `supabase/setup-storage.sql`
2. This creates the `interview-audio` bucket with:
   - 500MB file size limit
   - Allowed MIME types: MP3, M4A, WAV, WebM, OGG
   - Public read access (required for AssemblyAI to fetch audio URLs)
   - Authenticated upload/delete policies

### 3.4 Enable Realtime

1. In the SQL Editor, run `supabase/enable-realtime.sql`
2. This enables real-time status updates on the `interviews` table
3. The frontend subscribes to `postgres_changes` to show live pipeline progress

### 3.5 Configure Authentication

#### Email Provider

1. Go to **Authentication > Providers > Email**
2. Ensure **Enable Email provider** is ON
3. **Confirm email** can be ON or OFF depending on your needs

#### Site URL & Redirect URLs

1. Go to **Authentication > URL Configuration**
2. Set **Site URL** to: `http://localhost:3000` (or your production URL)
3. Add to **Redirect URLs**:
   - `http://localhost:3000/**`
   - (production) `https://your-domain.com/**`

#### Email Templates (CRITICAL)

The default Supabase magic link email uses PKCE flow, which requires the user to click the link in the **same browser** that requested it. This fails in common scenarios (email clients opening links in their own browser, using a different device, etc.).

**Fix: Use token_hash flow instead.**

1. Go to **Authentication > Email Templates**
2. Select **Magic Link** and replace the body with:

```html
<h2>Sign In to Sovereign Data</h2>
<p>Click the link below to sign in to your account:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink">Sign In</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>
```

3. Select **Confirm Signup** and replace the body with:

```html
<h2>Confirm Your Email</h2>
<p>Click the link below to confirm your account:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm Email</a></p>
```

4. Click **Save** on each template.

**Why**: The `token_hash` flow verifies the token directly via `supabase.auth.verifyOtp()` on the client, without needing a PKCE code verifier cookie. This works in any browser/device.

---

## 4. AssemblyAI Configuration

1. Sign up at [assemblyai.com](https://www.assemblyai.com)
2. Copy your API key to `.env.local`
3. The platform uses **Universal-2** model with:
   - **Speaker diarization** (identifies Speaker A, B, etc.)
   - **Language detection** (auto-detects or uses specified language)
   - **Webhook callbacks** to `/api/webhooks/transcription`

**For production**: Configure your AssemblyAI account for zero data retention (Settings > Data Handling).

---

## 5. OpenAI Configuration

1. Get an API key at [platform.openai.com](https://platform.openai.com/api-keys)
2. Copy it to `.env.local`
3. Models used:
   - **gpt-4o-mini** ($0.15/1M input tokens) — structured extraction
   - **text-embedding-3-small** ($0.02/1M tokens) — 1536-dim embeddings

**For production**: Request zero data retention via OpenAI's API data privacy settings.

---

## 6. Running the Application

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
# → http://localhost:3000
```

### First-Time Flow

1. Open `http://localhost:3000` → redirects to `/login`
2. Enter your email → receive magic link
3. Click the link → auto-signed in, redirected to `/projects`
4. Create a project (e.g., "Nigeria Energy Sector 2026")
5. Go to Interviews > Upload Interview
6. Upload an audio file (MP3, M4A, WAV, etc.)
7. Watch the pipeline progress in real-time on the interview detail page
8. Once complete: view transcript, entities, summary, and search across all interviews

---

## 7. Known Issues & Solutions

### PKCE Code Verifier Error

**Problem**: `PKCE code verifier not found in storage` when clicking the magic link.

**Cause**: Default Supabase magic link emails use PKCE flow, which stores a code verifier in the browser cookie. If the user opens the link in a different browser/email client, the verifier is missing.

**Solution**: Change the Supabase email templates to use `token_hash` (see Section 3.5 above). The app's `/auth/confirm` page handles `token_hash` verification via `supabase.auth.verifyOtp()`.

### pgvector Extension Name

**Problem**: `CREATE EXTENSION "pgvector"` fails on Supabase.

**Cause**: The extension is named `"vector"` in Supabase's managed PostgreSQL, not `"pgvector"`.

**Solution**: Use `CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";`

### RLS Infinite Recursion & auth.uid() NULL in PostgREST

**Problem**: `infinite recursion detected in policy for relation "project_members"` and `new row violates row-level security policy` on INSERT.

**Cause**: Two issues:
1. RLS policies on `project_members` query themselves, causing infinite recursion.
2. `auth.uid()` returns NULL in the PostgREST context for both browser and server Supabase clients, even when `getUser()` succeeds. This is a known issue with `@supabase/ssr` cookie-based auth and PostgREST JWT propagation.

**Solution**:
1. Run `supabase/migrations/00002_fix_rls_recursion.sql` — creates `SECURITY DEFINER` helper functions (`is_project_member`, `is_project_owner`, etc.) and rewrites all policies to use them.
2. Run `supabase/migrations/00003_fix_created_by_default.sql` — adds `DEFAULT auth.uid()` to `created_by` columns.
3. All server-side mutations (Server Actions, API routes) verify the user via `getUser()` first, then use the admin client (service role) for DB writes. This bypasses RLS safely since auth is already verified.

### AssemblyAI speech_model Parameter

**Problem**: `"speech_models" must be a non-empty list containing one or more of: "universal-3-pro", "universal-2"`.

**Cause**: As of 2026, AssemblyAI requires the `speech_model` parameter in transcription requests. Previously it was optional and defaulted to the latest model.

**Solution**: Include `speech_models: ["universal-2"]` (plural, array) in the transcription request body. The singular `speech_model` is also deprecated.

### pg_trgm Index Error

**Problem**: `operator class "gin_trgm_ops" does not exist` when creating the entities name index.

**Cause**: The `pg_trgm` extension must be enabled before creating indexes that use `gin_trgm_ops`.

**Solution**: Move `CREATE EXTENSION IF NOT EXISTS "pg_trgm"` to the top of the migration, before any table/index creation.

### Port Conflicts

**Problem**: Dev server starts on port 3001 instead of 3000.

**Cause**: Another process occupies port 3000.

**Solution**: Kill the process (`lsof -ti:3000 | xargs kill`) and restart. The auth callback URLs are origin-dependent, so port mismatches break the login flow.

---

## 8. Deployment (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel Dashboard:
# - All variables from .env.local
# - Update NEXT_PUBLIC_APP_URL to your production URL
# - Update Supabase Redirect URLs to include your production domain
```

---

## 9. Data Flow Reference

```
User uploads MP3
  │
  ▼
Supabase Storage (interview-audio bucket)
  │
  ▼
POST /api/interviews
  ├─ Creates interview record (status: PROCESSING)
  └─ Submits audio URL to AssemblyAI (status: TRANSCRIBING)
       │
       ▼
  AssemblyAI processes (async, 1-5 minutes)
       │
       ▼
  POST /api/webhooks/transcription (webhook callback)
       │
       ▼
  ETL Pipeline (src/lib/ai/pipeline.ts):
    1. Fetch transcript from AssemblyAI (status: EXTRACTING)
    2. GPT-4o-mini extraction → summary, sentiment, entities, topics
    3. Speaker-aware chunking (~500 tokens per chunk) (status: EMBEDDING)
    4. OpenAI embeddings → vector(1536) per chunk
    5. Persist chunks + entities to PostgreSQL (status: COMPLETED)
       │
       ▼
  Interview detail page updates in real-time via Supabase Realtime
```
