-- Phase 4b — Thematic entity types: TOPIC, RISK, OPPORTUNITY, PROJECT
--
-- Additive only: every existing entity_type value stays valid.
-- Note: SECTOR and COMMODITY were already added in 00025_entity_type_expansion.sql.
--
-- TOPIC      — a substantive named theme or subject area discussed across
--              multiple sources (e.g. "Energy Transition", "Fiscal Reform",
--              "Digital Infrastructure"). Distinct from the filter tags in
--              sources.topics[].
--
-- RISK       — a named significant risk, threat, or challenge that can be
--              tracked and linked across sources (e.g. "Regulatory Uncertainty
--              in Angola", "Currency Devaluation Risk").
--
-- OPPORTUNITY — a named significant opportunity or positive prospect that can
--              be tracked across sources (e.g. "LNG Export to Europe",
--              "Green Hydrogen Investment").
--
-- PROJECT    — a named real-world project, initiative, or programme mentioned
--              in sources (e.g. "Trans-Saharan Gas Pipeline", "Dangote
--              Refinery"). Distinct from Aksum workspace `projects`.

ALTER TYPE public.entity_type ADD VALUE IF NOT EXISTS 'TOPIC';
ALTER TYPE public.entity_type ADD VALUE IF NOT EXISTS 'RISK';
ALTER TYPE public.entity_type ADD VALUE IF NOT EXISTS 'OPPORTUNITY';
ALTER TYPE public.entity_type ADD VALUE IF NOT EXISTS 'PROJECT';
