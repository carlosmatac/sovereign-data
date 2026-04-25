-- ============================================================
-- Migration 00024: relationship taxonomy v2
-- ============================================================
-- Minimal pragmatic upgrade to the `relation_type` enum.
--
-- Adds four new values that better describe the relationships we
-- actually see in interviews:
--
--   - affiliated_with : person ↔ organisation generic association
--                       (employee, director, ministry official, spokesperson,
--                        senior staff, etc.). Replaces overuse of
--                        `business_partner` for person↔org.
--   - operates_in     : organisation ↔ country/location operational
--                       presence. Replaces overuse of `business_partner` /
--                       `ally` for org↔country.
--   - governs         : government / regulator ↔ organisation / country
--                       institutional control (ministry, central bank, …).
--   - customer_of     : commercial buyer ↔ vendor/supplier relationship.
--
-- LEGACY values (`business_partner`, `ally`) are intentionally kept so
-- existing rows continue to render. Updated extraction guidance steers
-- the LLM away from them when a better type exists. See
-- src/lib/ai/extraction.ts and
-- docs/features/on-going/editable-relationship-governance.md.
--
-- Postgres requires `ALTER TYPE ... ADD VALUE` outside of a transaction
-- block in older versions. Each `ADD VALUE` is idempotent via `IF NOT
-- EXISTS` so this migration is safe to re-run on environments that have
-- already applied a partial taxonomy update.
-- ============================================================

ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'affiliated_with';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'operates_in';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'governs';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'customer_of';
