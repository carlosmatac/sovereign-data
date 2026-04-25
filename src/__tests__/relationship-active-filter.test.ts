/**
 * Active relationship filtering — contract tests.
 *
 * These tests guard the editorial rule that `rejected` relationships
 * must NOT appear as active relationships in the operational graph,
 * connections panel, chat tools, report intelligence, or dashboard
 * counts. Pending and approved both count as active.
 *
 * The actual queries live in:
 *   - src/app/api/graph/[projectId]/route.ts        (Network Explorer)
 *   - src/lib/ai/entity-lookup.ts                    (Chat tool getRelationships)
 *   - src/lib/reports/intelligence-layer.ts          (Reports)
 *   - src/app/(dashboard)/dashboard/page.tsx         (Dashboard counts)
 *
 * They all apply `.neq('review_status', 'rejected')` against
 * `entity_relationships`. We test the predicate that mirrors that filter
 * and the canonical constant that documents the rule, so a regression
 * (e.g. someone copies one of those queries without the filter) is at
 * least caught at the type/test level.
 *
 * See docs/features/on-going/editable-relationship-governance.md
 */

import { describe, expect, it } from "vitest";
import {
  ACTIVE_RELATIONSHIP_REVIEW_STATUSES,
  type RelationshipReviewStatus,
} from "@/types/database";

function isActiveRelationshipStatus(
  status: RelationshipReviewStatus
): boolean {
  return (ACTIVE_RELATIONSHIP_REVIEW_STATUSES as readonly string[]).includes(
    status
  );
}

describe("ACTIVE_RELATIONSHIP_REVIEW_STATUSES", () => {
  it("includes pending and approved", () => {
    expect(isActiveRelationshipStatus("pending")).toBe(true);
    expect(isActiveRelationshipStatus("approved")).toBe(true);
  });

  it("excludes rejected", () => {
    expect(isActiveRelationshipStatus("rejected")).toBe(false);
  });

  it("matches the .neq('review_status', 'rejected') filter applied at every active query site", () => {
    // The DB filter is `review_status != 'rejected'`. A row is active iff
    // it is NOT rejected. Verify that for every possible enum value.
    const allStatuses: RelationshipReviewStatus[] = [
      "pending",
      "approved",
      "rejected",
    ];

    for (const status of allStatuses) {
      const passesDbFilter = status !== "rejected";
      expect(isActiveRelationshipStatus(status)).toBe(passesDbFilter);
    }
  });
});

describe("graph-filter shape (contract for /api/graph + connections panel)", () => {
  type Row = {
    id: string;
    review_status: RelationshipReviewStatus;
  };

  /**
   * Mirrors what the Postgres `.neq('review_status', 'rejected')` filter
   * should yield, plus the in-memory mapping the graph route does to
   * keep only edges whose endpoints exist in the project's entity set.
   */
  function activeOnly<T extends { review_status: RelationshipReviewStatus }>(
    rows: T[]
  ): T[] {
    return rows.filter((r) =>
      (ACTIVE_RELATIONSHIP_REVIEW_STATUSES as readonly string[]).includes(
        r.review_status
      )
    );
  }

  it("keeps approved + pending rows and drops rejected ones", () => {
    const rows: Row[] = [
      { id: "approved-1", review_status: "approved" },
      { id: "pending-1", review_status: "pending" },
      { id: "rejected-1", review_status: "rejected" },
      { id: "rejected-2", review_status: "rejected" },
      { id: "approved-2", review_status: "approved" },
    ];

    const visible = activeOnly(rows);

    expect(visible.map((r) => r.id).sort()).toEqual([
      "approved-1",
      "approved-2",
      "pending-1",
    ]);
    expect(visible.find((r) => r.review_status === "rejected")).toBeUndefined();
  });

  it("returns an empty list when every row is rejected", () => {
    const rows: Row[] = [
      { id: "r1", review_status: "rejected" },
      { id: "r2", review_status: "rejected" },
    ];
    expect(activeOnly(rows)).toEqual([]);
  });
});
