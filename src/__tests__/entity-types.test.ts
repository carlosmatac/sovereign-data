import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPE_VALUES,
  ORG_LIKE_ENTITY_TYPES,
  isEntityType,
  isOrgLikeEntityType,
} from "@/types/database";
import { EntityTypeSchema, buildEntityTypeGuidance } from "@/lib/ai/extraction";
import { parseEntityTypeFilters } from "@/app/api/projects/[projectId]/entities/search/route";

const NEW_ENTITY_TYPES = [
  "COUNTRY",
  "SECTOR",
  "COMMODITY",
  "PUBLIC_INSTITUTION",
  "STATE_OWNED_ENTERPRISE",
  "LAW_OR_POLICY",
  "MEDIA_OR_PUBLICATION",
] as const;

const PHASE_4B_ENTITY_TYPES = [
  "TOPIC",
  "RISK",
  "OPPORTUNITY",
  "PROJECT",
] as const;

describe("entity type expansion", () => {
  it("exposes the expanded entity type list from one source of truth", () => {
    expect(ENTITY_TYPE_VALUES).toEqual([
      "PERSON",
      "COMPANY",
      "GOVERNMENT",
      "ORGANIZATION",
      "LOCATION",
      "EVENT",
      ...NEW_ENTITY_TYPES,
      ...PHASE_4B_ENTITY_TYPES,
    ]);

    for (const type of NEW_ENTITY_TYPES) {
      expect(isEntityType(type)).toBe(true);
    }

    for (const type of PHASE_4B_ENTITY_TYPES) {
      expect(isEntityType(type)).toBe(true);
    }
  });

  it("allows expanded entity types in the extraction schema", () => {
    for (const type of ENTITY_TYPE_VALUES) {
      expect(EntityTypeSchema.parse(type)).toBe(type);
    }

    expect(() => EntityTypeSchema.parse("PROGRAM")).toThrow();
  });

  it("accepts expanded entity types in search allowlists", () => {
    expect(
      parseEntityTypeFilters({
        typeParam: "COUNTRY",
        typesParam: "",
      })
    ).toEqual(["COUNTRY"]);

    expect(
      parseEntityTypeFilters({
        typeParam: "PERSON",
        typesParam: "PUBLIC_INSTITUTION,STATE_OWNED_ENTERPRISE,NOT_A_TYPE",
      })
    ).toEqual(["PUBLIC_INSTITUTION", "STATE_OWNED_ENTERPRISE"]);
  });

  it("treats the correct expanded types as org-like", () => {
    expect(ORG_LIKE_ENTITY_TYPES).toContain("PUBLIC_INSTITUTION");
    expect(ORG_LIKE_ENTITY_TYPES).toContain("STATE_OWNED_ENTERPRISE");
    expect(ORG_LIKE_ENTITY_TYPES).toContain("MEDIA_OR_PUBLICATION");

    expect(isOrgLikeEntityType("PUBLIC_INSTITUTION")).toBe(true);
    expect(isOrgLikeEntityType("STATE_OWNED_ENTERPRISE")).toBe(true);
    expect(isOrgLikeEntityType("COUNTRY")).toBe(false);
    expect(isOrgLikeEntityType("COMMODITY")).toBe(false);
    expect(isOrgLikeEntityType("LAW_OR_POLICY")).toBe(false);
  });
});

describe("Phase 4b — thematic entity types", () => {
  it("Phase 4b types are valid EntityType values", () => {
    for (const type of PHASE_4B_ENTITY_TYPES) {
      expect(EntityTypeSchema.parse(type)).toBe(type);
      expect(isEntityType(type)).toBe(true);
    }
  });

  it("Phase 4b types are NOT org-like", () => {
    for (const type of PHASE_4B_ENTITY_TYPES) {
      expect(isOrgLikeEntityType(type)).toBe(false);
    }
  });

  it("buildEntityTypeGuidance includes thematic types when flag is on", () => {
    const guidance = buildEntityTypeGuidance(true);
    expect(guidance).toContain("TOPIC");
    expect(guidance).toContain("RISK");
    expect(guidance).toContain("OPPORTUNITY");
    expect(guidance).toContain("PROJECT");
  });

  it("buildEntityTypeGuidance excludes thematic types when flag is off", () => {
    const guidance = buildEntityTypeGuidance(false);
    expect(guidance).not.toContain("TOPIC:");
    expect(guidance).not.toContain("RISK:");
    expect(guidance).not.toContain("OPPORTUNITY:");
    expect(guidance).not.toContain("PROJECT:");
    // Base types still present
    expect(guidance).toContain("SECTOR");
    expect(guidance).toContain("COMMODITY");
  });

  it("search allowlists accept Phase 4b entity types", () => {
    expect(
      parseEntityTypeFilters({ typeParam: "TOPIC", typesParam: "" })
    ).toEqual(["TOPIC"]);
    expect(
      parseEntityTypeFilters({
        typeParam: "",
        typesParam: "RISK,OPPORTUNITY,PROJECT,NOT_A_TYPE",
      })
    ).toEqual(["RISK", "OPPORTUNITY", "PROJECT"]);
  });
});
