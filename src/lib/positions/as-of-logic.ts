import type { DatePrecision } from "@/types/database";

/** Inclusive lower bound in ms UTC for a position start; null means unbounded past. */
export function effectiveValidFromMs(
  date: string | null,
  precision: DatePrecision
): number | null {
  if (precision === "unknown" || !date) return null;
  const t = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isNaN(t) ? null : t;
}

/** Inclusive upper bound in ms UTC for a position end; null means unbounded future. */
export function effectiveValidToMs(
  date: string | null,
  precision: DatePrecision,
  state: "active" | "ended" | "pending_review" | "uncertain"
): number | null {
  if (state === "active") {
    if (!date || precision === "unknown") return null;
  }
  if (!date) return null;
  const t = Date.parse(`${date}T23:59:59.999Z`);
  return Number.isNaN(t) ? null : t;
}

/**
 * Whether `asOf` (UTC midnight of ISO date string YYYY-MM-DD) falls inside [from, to].
 */
export function positionContainsAsOfDate(
  asOfIsoDate: string,
  params: {
    valid_from_date: string | null;
    valid_from_precision: DatePrecision;
    valid_to_date: string | null;
    valid_to_precision: DatePrecision;
    state: "active" | "ended" | "pending_review" | "uncertain";
  }
): boolean {
  const asOfMs = Date.parse(`${asOfIsoDate}T12:00:00.000Z`);
  if (Number.isNaN(asOfMs)) return false;

  const fromMs = effectiveValidFromMs(
    params.valid_from_date,
    params.valid_from_precision
  );
  const toMs = effectiveValidToMs(
    params.valid_to_date,
    params.valid_to_precision,
    params.state
  );

  if (fromMs !== null && asOfMs < fromMs) return false;
  if (toMs !== null && asOfMs > toMs) return false;
  return true;
}

/**
 * True when the stored precision is too weak for a user asking a pin-point historical question.
 */
export function precisionInsufficientForExactHistoricalQuery(
  params: {
    valid_from_precision: DatePrecision;
    valid_to_precision: DatePrecision;
  }
): boolean {
  return (
    params.valid_from_precision === "unknown" ||
    params.valid_to_precision === "unknown"
  );
}
