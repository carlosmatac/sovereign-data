import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionRow } from "./query-validated-positions";
import {
  enrichPositionForTool,
  formatPositionsForSystemPrompt,
  freshnessBucket,
} from "./query-validated-positions";

function baseRow(overrides: Partial<PositionRow> = {}): PositionRow {
  return {
    id: "p1",
    person_entity_id: "person-1",
    organization_entity_id: "org-1",
    title: "CEO",
    is_main: true,
    state: "active",
    valid_from_date: "2020-01-01",
    valid_from_precision: "exact",
    valid_to_date: null,
    valid_to_precision: "unknown",
    validated_at: "2026-01-01T00:00:00.000Z",
    person_name: "Ada",
    organization_name: "Acme",
    ...overrides,
  };
}

describe("freshnessBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns fresh when validated within 6 calendar months", () => {
    expect(freshnessBucket("2026-03-01T00:00:00.000Z")).toBe("fresh");
  });

  it("returns potentially_stale between 6 and 12 months", () => {
    expect(freshnessBucket("2025-08-01T00:00:00.000Z")).toBe(
      "potentially_stale"
    );
  });

  it("returns old at 12+ months", () => {
    expect(freshnessBucket("2025-05-01T00:00:00.000Z")).toBe("old");
  });
});

describe("enrichPositionForTool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets confidence_degraded when exact historical ask meets unknown precision", () => {
    const row = baseRow({
      valid_from_precision: "unknown",
      valid_to_precision: "exact",
    });
    const out = enrichPositionForTool(row, {
      wantsExactHistorical: true,
      asOfIsoDate: "2022-01-01",
    });
    expect(out.confidence_degraded).toBe(true);
    expect(out.confidence_note).toContain("approximate");
  });

  it("does not degrade when precisions are sufficient", () => {
    const row = baseRow({
      valid_from_precision: "exact",
      valid_to_precision: "exact",
      valid_to_date: "2025-12-31",
    });
    const out = enrichPositionForTool(row, {
      wantsExactHistorical: true,
      asOfIsoDate: "2022-01-01",
    });
    expect(out.confidence_degraded).toBe(false);
    expect(out.confidence_note).toBeNull();
  });
});

describe("formatPositionsForSystemPrompt", () => {
  it("returns empty string for no rows", () => {
    expect(formatPositionsForSystemPrompt([])).toBe("");
  });

  it("includes authoritative header and key fields", () => {
    const text = formatPositionsForSystemPrompt([baseRow()]);
    expect(text).toContain("VALIDATED POSITIONS");
    expect(text).toContain("Ada");
    expect(text).toContain("CEO");
    expect(text).toContain("Acme");
    expect(text).toContain("[MAIN]");
    expect(text).toContain("validated_at=");
  });
});
