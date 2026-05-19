-- ============================================================
-- Migration 00046: entity_type expansion v2
-- ============================================================
-- Adds 9 new entity types to support the canonical taxonomy
-- defined in docs/features/to-do/entity-relationship-extraction.md.
--
-- EXISTING types (not touched):
--   PERSON, COMPANY, GOVERNMENT, ORGANIZATION, LOCATION, EVENT,
--   COUNTRY, SECTOR, COMMODITY, PUBLIC_INSTITUTION,
--   STATE_OWNED_ENTERPRISE, LAW_OR_POLICY, MEDIA_OR_PUBLICATION,
--   TOPIC, RISK, OPPORTUNITY, PROJECT
--
-- NEW types:
--   COUNTRY_REGION       : sub-national geography (provinces, states,
--                          economic zones). Distinct from LOCATION
--                          (cities, ports, infrastructure) and COUNTRY.
--   CORPORATE_EVENT      : IPOs, rights issues, mergers, acquisitions,
--                          listings. Previously forced into EVENT.
--   EDUCATIONAL_INSTITUTION: universities, business schools, research
--                          institutes. Previously forced into
--                          PUBLIC_INSTITUTION or ORGANIZATION.
--   EXCHANGE             : financial exchanges (JSE, NYSE, NYMEX).
--                          Previously not extractable.
--   FACILITY             : refineries, ports, plants, data centres,
--                          physical infrastructure. Previously forced
--                          into LOCATION.
--   LANGUAGE             : human languages (Arabic, Hausa, Swahili).
--   PRODUCT              : manufactured/commercial goods. Distinct from
--                          COMMODITY (traded raw materials).
--   WORK_OF_ART          : publications, reports, books, research papers,
--                          films. Previously not extractable.
--   ENTITY               : generic fallback for entities that don't fit
--                          any specific type.
--
-- All ADD VALUE statements use IF NOT EXISTS for idempotency.
-- ============================================================

ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'COUNTRY_REGION';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'CORPORATE_EVENT';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'EDUCATIONAL_INSTITUTION';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'EXCHANGE';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'FACILITY';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'LANGUAGE';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'PRODUCT';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'WORK_OF_ART';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'ENTITY';
