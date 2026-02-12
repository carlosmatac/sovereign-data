-- ============================================
-- Supabase Storage Bucket Setup
-- ============================================
-- Run this in the Supabase SQL Editor AFTER the main migration.
-- This creates the audio storage bucket and its access policies.

-- Create the bucket (private by default)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'interview-audio',
  'interview-audio',
  true,  -- public read (AssemblyAI needs to fetch the URL)
  524288000, -- 500MB limit
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-m4a']
);

-- Storage policy: authenticated users can upload to their project folders
CREATE POLICY "Project members can upload audio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'interview-audio'
    AND auth.uid() IS NOT NULL
  );

-- Storage policy: anyone can read (needed for AssemblyAI webhook)
CREATE POLICY "Public read access for audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'interview-audio');

-- Storage policy: project editors can delete audio
CREATE POLICY "Authenticated users can delete own audio"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'interview-audio'
    AND auth.uid() IS NOT NULL
  );
