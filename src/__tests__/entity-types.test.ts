import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPE_VALUES,
  ORG_LIKE_ENTITY_TYPES,
  isEntityType,
  isOrgLikeEntityType,
} from "@/types/database";
import { EntityTypeSchema } from "@/lib/ai/extraction";
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
    ]);

    for (const type of NEW_ENTITY_TYPES) {
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
