import { describe, expect, it } from "vitest";
import {
  isPersistableMatchMethod,
  PERSISTABLE_MATCH_METHODS,
  type MatchMethod,
} from "./ground-mentions";

describe("ground-mentions persistence policy", () => {
  it("allows `exact` as evidence for persistence", () => {
    expect(isPersistableMatchMethod("exact")).toBe(true);
  });

  it("allows `alias` as evidence for persistence", () => {
    expect(isPersistableMatchMethod("alias")).toBe(true);
  });

  it("does NOT allow `anchor_context` as evidence for persistence", () => {
    expect(isPersistableMatchMethod("anchor_context")).toBe(false);
  });

  it("does NOT allow `fuzzy` as evidence for persistence", () => {
    expect(isPersistableMatchMethod("fuzzy")).toBe(false);
  });

  it("the persistable set is exactly {exact, alias} — locks the policy", () => {
    const expected: ReadonlySet<MatchMethod> = new Set<MatchMethod>([
      "exact",
      "alias",
    ]);
    expect(PERSISTABLE_MATCH_METHODS.size).toBe(expected.size);
    for (const method of expected) {
      expect(PERSISTABLE_MATCH_METHODS.has(method)).toBe(true);
    }
  });
});
