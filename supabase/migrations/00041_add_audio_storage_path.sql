-- Migration 00041 — Private audio storage path
--
-- Adds audio_storage_path to sources so new uploads can reference a
-- private Supabase Storage bucket instead of storing a public URL.
-- Existing rows keep audio_url for backward-compatible playback.
--
-- Also creates the private bucket and an authenticated-upload policy,
-- and refreshes the interviews back-compat view (SELECT * expansion
-- does not pick up new base-table columns automatically — same pattern
-- as migration 00036).

-- 1. Add column to the canonical table
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS audio_storage_path TEXT;

-- 2. Refresh the back-compat view so it surfaces the new column
CREATE OR REPLACE VIEW public.interviews AS
  SELECT * FROM public.sources;

-- 3. Create the private bucket (idempotent — ON CONFLICT DO NOTHING)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'source-audio-private',
  'source-audio-private',
  false,
  524288000   -- 500 MB, matching MAX_AUDIO_SIZE_MB in constants.ts
)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS policy — authenticated users may upload their own files
--    (the browser client uses the anon/cookie session, same as the
--    existing interview-audio bucket; service role bypasses RLS anyway)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Authenticated users can upload to source-audio-private'
  ) THEN
    CREATE POLICY "Authenticated users can upload to source-audio-private"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'source-audio-private');
  END IF;
END $$;

-- 5. RLS policy — service role (admin client) can read/delete objects
--    for signed URL generation and storage cleanup on source deletion.
--    (Service role bypasses RLS by default, so this is a no-op guard.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Service role full access to source-audio-private'
  ) THEN
    CREATE POLICY "Service role full access to source-audio-private"
      ON storage.objects
      FOR ALL
      TO service_role
      USING (bucket_id = 'source-audio-private');
  END IF;
END $$;
