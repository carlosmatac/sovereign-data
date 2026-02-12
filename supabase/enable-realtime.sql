-- ============================================
-- Enable Supabase Realtime on the interviews table
-- ============================================
-- This allows the frontend to subscribe to status changes
-- via Supabase Realtime (postgres_changes).
--
-- Run this in the Supabase SQL Editor.

ALTER PUBLICATION supabase_realtime ADD TABLE interviews;
