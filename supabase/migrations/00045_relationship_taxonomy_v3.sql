-- ============================================================
-- Migration 00045: relationship taxonomy v3
-- ============================================================
-- Extends relation_type with the canonical snake_case taxonomy
-- defined in docs/features/to-do/entity-relationship-extraction.md.
--
-- EXISTING types (already in DB — not touched):
--   supplier, competitor, investor*, subsidiary*, acquirer,
--   critic, advisor, regulator*, affiliated_with, operates_in*,
--   governs*, customer_of, business_partner†, ally†
--
--   * deprecated for NEW writes; better type exists (see spec)
--   † legacy; do not emit from extraction or anchor creation
--
-- NEW types added here (37 values):
--   Employment / role    : works_at, leads, is_ceo_of, is_cfo_of,
--                          is_cto_of, is_coo_of, is_cmo_of, is_cso_of,
--                          is_board_member_of, is_member_of, founded
--   Ownership / control  : is_direct_parent_of, is_ultimate_parent_of,
--                          invested_in, is_beneficial_owner_of,
--                          is_controlled_person_of
--   Geography            : has_headquarters_in, has_presence_in,
--                          is_registered_in, located_in, within,
--                          has_nationality, native_to
--   Governance           : has_jurisdiction, operates_in_industry
--   Events / activities  : spoke_at, participates_in_corporate_event,
--                          studied_at, featured_in
--   Markets / finance    : listed_on, traded_on
--   Products / works     : manufactured_by, published_by, created_by,
--                          designed_by, operated_by, spoken_in
--
-- Also adds `anchor_derived` to relationship_origin enum.
--
-- All ADD VALUE statements use IF NOT EXISTS so this migration is
-- safe to re-run on any environment.
-- PostgreSQL requires ADD VALUE outside a transaction block.
-- ============================================================

-- ── relationship_origin ──────────────────────────────────────────────────────
ALTER TYPE relationship_origin ADD VALUE IF NOT EXISTS 'anchor_derived';

-- ── Employment / role ────────────────────────────────────────────────────────
-- works_at    : PERSON → org (generic employment when no specific C-suite type fits)
-- leads       : PERSON → org (minister, head of, chairperson; broader than is_ceo_of)
-- is_ceo_of   : PERSON → org
-- is_cfo_of   : PERSON → org
-- is_cto_of   : PERSON → org
-- is_coo_of   : PERSON → org
-- is_cmo_of   : PERSON → org
-- is_cso_of   : PERSON → org (Chief Strategy Officer)
-- is_board_member_of : PERSON → org
-- is_member_of       : PERSON or org → org (member of coalition, body, group)
-- founded            : PERSON or org → org

ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'works_at';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'leads';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_ceo_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_cfo_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_cto_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_coo_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_cmo_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_cso_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_board_member_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_member_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'founded';

-- ── Ownership / control ──────────────────────────────────────────────────────
-- is_direct_parent_of    : parent org → child org
-- is_ultimate_parent_of  : ultimate parent org → any subsidiary
-- invested_in            : investor → investee (replaces deprecated `investor`)
-- is_beneficial_owner_of : PERSON → org
-- is_controlled_person_of: PERSON → org (acts under direction of controlling party)

ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_direct_parent_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_ultimate_parent_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'invested_in';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_beneficial_owner_of';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_controlled_person_of';

-- ── Geography ────────────────────────────────────────────────────────────────
-- has_headquarters_in : org → COUNTRY / COUNTRY_REGION / FACILITY
-- has_presence_in     : org → COUNTRY / COUNTRY_REGION (replaces deprecated `operates_in`)
-- is_registered_in    : org → COUNTRY (legal domicile)
-- located_in          : any → COUNTRY / COUNTRY_REGION / FACILITY
-- within              : COUNTRY_REGION or FACILITY → COUNTRY / COUNTRY_REGION
-- has_nationality     : PERSON → COUNTRY
-- native_to           : PERSON or LANGUAGE → COUNTRY / COUNTRY_REGION

ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'has_headquarters_in';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'has_presence_in';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'is_registered_in';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'located_in';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'within';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'has_nationality';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'native_to';

-- ── Governance ───────────────────────────────────────────────────────────────
-- has_jurisdiction    : GOVERNMENT / PUBLIC_INSTITUTION → org/COUNTRY
--                       (replaces deprecated `regulator` and `governs`)
-- operates_in_industry: org → SECTOR / INDUSTRY

ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'has_jurisdiction';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'operates_in_industry';

-- ── Events / activities ──────────────────────────────────────────────────────
-- spoke_at                     : PERSON → EVENT / CORPORATE_EVENT
-- participates_in_corporate_event : org or PERSON → CORPORATE_EVENT
-- studied_at                   : PERSON → EDUCATIONAL_INSTITUTION
-- featured_in                  : PERSON or org → work / EVENT

ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'spoke_at';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'participates_in_corporate_event';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'studied_at';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'featured_in';

-- ── Markets / finance ────────────────────────────────────────────────────────
-- listed_on : COMPANY → EXCHANGE
-- traded_on : COMMODITY / PRODUCT → EXCHANGE

ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'listed_on';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'traded_on';

-- ── Products / works ─────────────────────────────────────────────────────────
-- manufactured_by : PRODUCT / COMMODITY → org
-- published_by    : WORK_OF_ART / LAW_OR_POLICY → org / GOVERNMENT
-- created_by      : WORK_OF_ART / PRODUCT → PERSON or org
-- designed_by     : PRODUCT → PERSON or org
-- operated_by     : FACILITY / infrastructure → org (operator/concessionaire)
-- spoken_in       : LANGUAGE → COUNTRY / COUNTRY_REGION

ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'manufactured_by';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'published_by';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'created_by';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'designed_by';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'operated_by';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'spoken_in';
