import { describe, expect, it } from "vitest";
import {
  effectiveValidFromMs,
  effectiveValidToMs,
  positionContainsAsOfDate,
  precisionInsufficientForExactHistoricalQuery,
} from "./as-of-logic";

describe("effectiveValidFromMs", () => {
  it("returns null for unknown precision", () => {
    expect(effectiveValidFromMs("2020-01-01", "unknown")).toBeNull();
  });

  it("returns null when date is null", () => {
    expect(effectiveValidFromMs(null, "exact")).toBeNull();
  });

  it("returns UTC start of day for exact date", () => {
    const ms = effectiveValidFromMs("2020-06-15", "exact");
    expect(ms).toBe(Date.parse("2020-06-15T00:00:00.000Z"));
  });
});

describe("effectiveValidToMs", () => {
  it("returns null for active position with no end date", () => {
    expect(
      effectiveValidToMs(null, "exact", "active")
    ).toBeNull();
  });

  it("returns null for active position with unknown end precision", () => {
    expect(
      effectiveValidToMs("2025-12-31", "unknown", "active")
    ).toBeNull();
  });

  it("returns end of UTC day for ended position with date", () => {
    const ms = effectiveValidToMs("2020-03-01", "exact", "ended");
    expect(ms).toBe(Date.parse("2020-03-01T23:59:59.999Z"));
  });
});

describe("positionContainsAsOfDate", () => {
  it("returns false for invalid as-of string", () => {
    expect(
      positionContainsAsOfDate("not-a-date", {
        valid_from_date: "2020-01-01",
        valid_from_precision: "exact",
        valid_to_date: null,
        valid_to_precision: "unknown",
        state: "active",
      })
    ).toBe(false);
  });

  it("includes as-of on start day (inclusive lower bound)", () => {
    expect(
      positionContainsAsOfDate("2020-01-01", {
        valid_from_date: "2020-01-01",
        valid_from_precision: "exact",
        valid_to_date: null,
        valid_to_precision: "unknown",
        state: "active",
      })
    ).toBe(true);
  });

  it("excludes as-of before range when from is known", () => {
    expect(
      positionContainsAsOfDate("2019-12-31", {
        valid_from_date: "2020-01-01",
        valid_from_precision: "exact",
        valid_to_date: null,
        valid_to_precision: "unknown",
        state: "active",
      })
    ).toBe(false);
  });

  it("respects inclusive upper bound for ended role", () => {
    expect(
      positionContainsAsOfDate("2021-06-01", {
        valid_from_date: "2020-01-01",
        valid_from_precision: "exact",
        valid_to_date: "2021-06-01",
        valid_to_precision: "exact",
        state: "ended",
      })
    ).toBe(true);
  });

  it("treats unbounded past when from is unknown", () => {
    expect(
      positionContainsAsOfDate("1990-01-01", {
        valid_from_date: null,
        valid_from_precision: "unknown",
        valid_to_date: "2000-01-01",
        valid_to_precision: "exact",
        state: "ended",
      })
    ).toBe(true);
  });
});

describe("precisionInsufficientForExactHistoricalQuery", () => {
  it("is true when either boundary precision is unknown", () => {
    expect(
      precisionInsufficientForExactHistoricalQuery({
        valid_from_precision: "unknown",
        valid_to_precision: "exact",
      })
    ).toBe(true);
    expect(
      precisionInsufficientForExactHistoricalQuery({
        valid_from_precision: "exact",
        valid_to_precision: "unknown",
      })
    ).toBe(true);
  });

  it("is false when both are non-unknown", () => {
    expect(
      precisionInsufficientForExactHistoricalQuery({
        valid_from_precision: "exact",
        valid_to_precision: "approximate",
      })
    ).toBe(false);
  });
});
