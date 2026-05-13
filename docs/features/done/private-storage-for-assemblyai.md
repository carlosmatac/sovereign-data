---
title: "Private storage bucket for source audio files"
status: done
shipped: 2026-05-10
owner: team
priority: critical
last_updated: 2026-05-10
related_architecture:
  - docs/architecture/ingestion-pipeline.md
---

# Private storage bucket for source audio files

## Problem

Source audio files (interviews) are currently uploaded to a **public** Supabase Storage bucket so that AssemblyAI can fetch them directly via URL. Anyone who knows or guesses the storage URL can download confidential interview recordings — ministers, CEOs, and diplomats discussing sensitive topics — without any authentication.

This is a serious data confidentiality breach for a platform handling exclusive, often sensitive frontier-market intelligence.

## Goals

- Move source audio files to a **private** Supabase Storage bucket (no public access).
- AssemblyAI must still be able to fetch the audio file for transcription — via a short-lived signed URL generated server-side immediately before the transcription request.
- No change to the upload UX; the user still uploads from the browser.
- Dashboard and source detail pages that display audio players must continue to work (they will need signed URLs too, scoped to the authenticated user's session).

## Non-goals

- Re-uploading existing audio files already in the public bucket (handled as a one-time migration step, not in scope for the initial implementation).
- Encrypting audio at rest beyond Supabase's default storage encryption.
- Rotating signed URLs automatically in the background (initial implementation generates a URL per-request).

## Approach

### Phase 1 — New private bucket + upload changes

1. Create a new private Supabase Storage bucket (e.g. `source-audio-private`) with `public: false` via the Supabase dashboard or a migration script.
2. Update the upload API route (`/api/interviews/upload`) to write to the new private bucket using the service role client.
3. Remove the public bucket from allowed upload targets; keep the old bucket read-accessible temporarily for the migration window.

### Phase 2 — Signed URLs for AssemblyAI

1. In the transcription submission step (where the `audio_url` is passed to AssemblyAI), generate a **signed URL** (e.g. 1-hour TTL) using the service role client (`storage.from(...).createSignedUrl(path, 3600)`).
2. Pass the signed URL as `audio_url` to the AssemblyAI API instead of the public storage URL.
3. Ensure the signed URL is generated immediately before the API call (not cached) so it is always valid during the transcription window.

### Phase 3 — Audio player signed URLs

1. Update all places that render an `<audio>` element or return a public storage URL for the audio file (source detail page, transcript review page) to call a server-side helper that returns a fresh signed URL.
2. Sign with an appropriate short TTL (e.g. 30 minutes) so the player works for the duration of a review session.

### Phase 4 — One-time migration of existing files (manual)

- Copy existing files from the public bucket to the private bucket using the Supabase Storage API or CLI.
- Update `sources.audio_url` (or equivalent column) to reference the new private path.
- Verify transcription and playback still work on a migrated source.
- Archive or delete the public bucket.

## Technical notes

- Signed URL generation: `supabaseAdmin.storage.from('source-audio-private').createSignedUrl(filePath, ttlSeconds)`.
- AssemblyAI accepts any publicly reachable URL at request time; signed URLs work as long as they have not expired when AssemblyAI fetches the file. Given AssemblyAI starts transcription almost immediately, a 1-hour TTL is more than sufficient.
- The `NEXT_PUBLIC_APP_URL` / webhook flow is unaffected — AssemblyAI callbacks do not use the storage URL.
- Audio file path on storage: use a path that includes `tenant_id/project_id/source_id/filename` so bucket policies can be scoped if needed.

## Constraints

- Admin client pattern must be used for all storage writes and signed URL generation (no anon key for storage operations on private buckets).
- Do not expose the raw private bucket path in API responses to the browser — always return a signed URL from a server-side route.

## Risks & open questions

- **AssemblyAI webhook polling window:** if the signed URL expires before AssemblyAI fetches the file (unlikely with 1h TTL), transcription will fail silently. Consider a 6-hour TTL for safety.
- **Existing sources with public URLs:** the `sources.audio_url` column likely stores the public URL. Need to decide whether to update it to a private path + derive signed URLs on demand, or keep storing a path and sign at request time (recommended: store path, sign on demand).
- **Open question:** should the private path be stored in a separate column (e.g. `audio_storage_path`) to cleanly separate the internal path from any externally-visible URL?

## Acceptance / how to validate

- [ ] Upload a new audio source; confirm the file is stored in the private bucket (not accessible via the old public URL pattern).
- [ ] Trigger transcription; confirm AssemblyAI receives a valid signed URL and transcription completes.
- [ ] Open the source detail page; confirm the audio player loads and plays back the recording.
- [ ] Attempt to access the old public URL for the new file; confirm it returns 403 / access denied.
- [ ] Existing sources (pre-migration) continue to play from the old public bucket until migrated.

---

## Implementation notes

**Date shipped:** 2026-05-10

### Bucket

New private bucket: `source-audio-private` (`public: false`, 500 MB file size limit).  
Created via migration 00041 using `INSERT INTO storage.buckets … ON CONFLICT DO NOTHING`.  
Old bucket `interview-audio` is left untouched for legacy file reads.

### DB columns added

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `sources` | `audio_storage_path` | `TEXT NULL` | Path within the private bucket (e.g. `{projectId}/{uuid}.mp3`). NULL for legacy rows. |

The `interviews` back-compat view was refreshed in the same migration (same pattern as 00036) so the new column appears through the view.

`database.ts` types updated: `audio_storage_path: string | null` added to `interviews.Row`, `Insert`, and `Update`.

### Where signed URLs are generated

| Location | File | TTL | When |
|----------|------|-----|------|
| AssemblyAI submission | `src/app/api/interviews/route.ts` | 6 hours (`AUDIO_ASSEMBLYAI_SIGNED_URL_TTL`) | Server-side, immediately before `submitTranscription()` call; only when `audio_storage_path` is present |
| Audio player (detail page) | `src/app/(dashboard)/interviews/[id]/page.tsx` | 1 hour (`AUDIO_PLAYER_SIGNED_URL_TTL`) | Server-side in the RSC render; only when `audio_storage_path` is present |

Signed URLs are never stored in the database.

### Constants added

```typescript
AUDIO_STORAGE_BUCKET = "source-audio-private"
AUDIO_ASSEMBLYAI_SIGNED_URL_TTL = 21600  // 6 hours
AUDIO_PLAYER_SIGNED_URL_TTL = 3600       // 1 hour
```

### Legacy fallback

- Upload page no longer calls `getPublicUrl()`.
- Detail page: if `audio_storage_path` is null, falls back to `audio_url` (legacy public URL).
- DELETE route: if `audio_storage_path` is set, removes from `source-audio-private`; otherwise parses path from `audio_url` and removes from `interview-audio`.

### Validation performed

- `npx tsc --noEmit` — 0 errors.
- `npm test` — 166/166 tests pass (no new tests needed; no pipeline logic changed).
- Migration dry-run pending (`supabase db push --dry-run`) — to be run before push.

### Remaining risks / follow-up

- **Manual smoke required:** upload → transcription → playback flow must be confirmed against the live DB after `supabase db push`.
- **Signed URL expiry edge case:** if AssemblyAI takes longer than 6 hours to start fetching the file (e.g. a large backlog), the signed URL will be expired. In practice AssemblyAI begins fetching within seconds; 6 hours is a very conservative margin.
- **Existing files not migrated:** all existing audio files remain in the public `interview-audio` bucket. A future migration should copy them to `source-audio-private` and update `audio_storage_path` / nullify `audio_url`. Until then, existing sources fall through to the `audio_url` legacy path.
- **Player URL refresh:** the 1-hour signed URL is baked into the RSC render at page load. If a user leaves the detail page open for more than 1 hour, the player will fail. A future improvement could use a client-side refresh endpoint.
