# Cost Model & FinOps

> Operational cost breakdown per service, usage formulas, and scale scenarios

This document provides a per-service cost model for Sovereign's infrastructure. Since no enterprise cost model PDF is present in the repository, costs are derived from published pricing and the actual configuration in the codebase.

---

## Service Cost Breakdown

### 1. AssemblyAI (Transcription)

| Parameter | Value | Source |
|-----------|-------|--------|
| Model | Universal-2 | `src/lib/ai/assemblyai.ts` |
| Speaker diarization | Included | `speaker_labels: true` |
| Pricing | $0.37 / audio minute | AssemblyAI published pricing (2026) |

**Formula**: `cost = audio_minutes × $0.37`

| Scale | Audio Hours / Month | Monthly Cost |
|-------|---------------------|--------------|
| Startup (10 interviews) | ~15 hrs | ~$333 |
| Growth (50 interviews) | ~75 hrs | ~$1,665 |
| Enterprise (200 interviews) | ~300 hrs | ~$6,660 |

> Interviews average 60–90 minutes. The table uses 90 minutes per interview as the upper bound.

### 2. OpenAI (Extraction + Embeddings + Reports)

#### GPT-4o-mini (Extraction + Content Snippets)

| Parameter | Value | Source |
|-----------|-------|--------|
| Model | `gpt-4o-mini` | `src/lib/constants.ts` → `AI_CONFIG.extractionModel` |
| Input pricing | $0.15 / 1M tokens | OpenAI published pricing |
| Output pricing | $0.60 / 1M tokens | OpenAI published pricing |

Per interview (extraction): ~5,000 input tokens (transcript) + ~2,000 output tokens (structured extraction) ≈ **$0.002**.

Per interview (4 content snippets): ~3,000 input + ~2,000 output ≈ **$0.002**.

#### GPT-4o (Report Generation)

| Parameter | Value | Source |
|-----------|-------|--------|
| Model | `gpt-4o` | `src/lib/ai/report-generation.ts` |
| Input pricing | $2.50 / 1M tokens | OpenAI published pricing |
| Output pricing | $10.00 / 1M tokens | OpenAI published pricing |

Per report: ~10,000 input tokens (context) + ~3,000 output tokens (1,500–3,000 word report) ≈ **$0.055**.

#### text-embedding-3-small (Embeddings + RAG Queries)

| Parameter | Value | Source |
|-----------|-------|--------|
| Model | `text-embedding-3-small` | `src/lib/ai/embeddings.ts` |
| Dimensions | 1536 | `AI_CONFIG.embeddingDimensions` |
| Pricing | $0.02 / 1M tokens | OpenAI published pricing |

Per interview (chunking): ~5,000 tokens across ~10 chunks ≈ **$0.0001**.

Per chat query: ~20 tokens ≈ negligible.

#### OpenAI Monthly Summary

| Scale | Interviews | Reports | Chat Queries | Monthly Cost |
|-------|-----------|---------|--------------|--------------|
| Startup | 10 | 5 | 200 | ~$0.32 |
| Growth | 50 | 20 | 1,000 | ~$1.30 |
| Enterprise | 200 | 50 | 5,000 | ~$3.55 |

> OpenAI costs are dominated by GPT-4o report generation. Extraction and embeddings are negligible.

### 3. Tavily (Web Search)

| Parameter | Value | Source |
|-----------|-------|--------|
| Integration | Raw `fetch` (no SDK) | `src/app/api/chat/route.ts` |
| Search depth | `advanced` | Hardcoded in route |
| Free tier | 1,000 searches/month | Tavily published pricing |
| Paid tier | $0.01 / search (Starter) | Tavily published pricing |

**Formula**: `cost = tavily_searches × $0.01`

Usage depends on chat patterns. The model decides autonomously whether to invoke web search — most queries are answered from internal context alone.

| Scale | Est. Web Searches / Month | Monthly Cost |
|-------|---------------------------|--------------|
| Startup | ~50 | Free tier |
| Growth | ~300 | ~$3 |
| Enterprise | ~2,000 | ~$20 |

### 4. Supabase (Database + Auth + Storage)

| Component | Free Tier | Pro Tier ($25/mo) |
|-----------|-----------|-------------------|
| Database | 500 MB | 8 GB |
| Auth | 50,000 MAUs | 100,000 MAUs |
| Storage | 1 GB | 100 GB |
| Edge functions | 500K invocations | 2M invocations |
| Realtime | 200 concurrent | 500 concurrent |

**Storage estimation** (audio files):
- Average audio file: ~50 MB (90 min MP3)
- 50 interviews → ~2.5 GB
- 200 interviews → ~10 GB (may require storage add-on)

**Database estimation** (vectors):
- Per chunk: ~6 KB (1536 × 4 bytes for float32)
- ~10 chunks per interview × 200 interviews = 2,000 chunks → ~12 MB vectors
- Text data and metadata: negligible at this scale

| Scale | Plan | Add-ons | Monthly Cost |
|-------|------|---------|--------------|
| Startup | Free | — | $0 |
| Growth | Pro | — | $25 |
| Enterprise | Pro | Storage (+$0.021/GB) | ~$27 |

### 5. Vercel (Hosting + Serverless)

| Component | Free Tier (Hobby) | Pro Tier ($20/mo) |
|-----------|-------------------|-------------------|
| Serverless function executions | 100 GB-hrs | 1,000 GB-hrs |
| Bandwidth | 100 GB | 1 TB |
| Build minutes | 6,000 min | 24,000 min |
| Concurrent builds | 1 | 1 |

**Key constraint**: The ingestion pipeline runs as a serverless function. Long interviews (90 min audio → complex extraction) may approach the 60s function timeout on Hobby. Vercel Pro allows 300s.

| Scale | Plan | Monthly Cost |
|-------|------|--------------|
| Startup | Hobby | $0 |
| Growth | Pro | $20 |
| Enterprise | Pro | $20 |

---

## Total Cost Projections

| Scale | Interviews/mo | AssemblyAI | OpenAI | Tavily | Supabase | Vercel | **Total** |
|-------|--------------|------------|--------|--------|----------|--------|-----------|
| **Startup** | 10 | $333 | $0.32 | $0 | $0 | $0 | **~$333** |
| **Growth** | 50 | $1,665 | $1.30 | $3 | $25 | $20 | **~$1,714** |
| **Enterprise** | 200 | $6,660 | $3.55 | $20 | $27 | $20 | **~$6,731** |

> **Key insight**: AssemblyAI transcription dominates costs at every scale (95%+). All other services combined are marginal. Optimizing cost means optimizing transcription — consider batching, audio compression, or negotiating enterprise pricing with AssemblyAI.

---

## Cost Optimization Levers

| Lever | Impact | Implementation |
|-------|--------|----------------|
| Negotiate AssemblyAI enterprise pricing | High | Volume discount at 100+ hrs/month |
| Compress audio before upload | Medium | Reduce file size and potentially duration of silence |
| Cache embedding queries | Low | Avoid re-embedding duplicate queries |
| Use GPT-4o-mini for reports | Medium | ~20x cheaper, lower quality — acceptable for drafts |
| Self-host pgvector | Medium | Eliminates Supabase Pro cost at scale |
| Batch content snippet generation | Low | Reduce OpenAI API call overhead |

---

## Environment Variables (Cost-Relevant)

| Variable | Service | Notes |
|----------|---------|-------|
| `ASSEMBLYAI_API_KEY` | AssemblyAI | Required |
| `OPENAI_API_KEY` | OpenAI | Required — covers extraction, embeddings, reports |
| `TAVILY_API_KEY` | Tavily | Optional — web search disabled gracefully if missing |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Required — admin client for RLS bypass |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Required |
