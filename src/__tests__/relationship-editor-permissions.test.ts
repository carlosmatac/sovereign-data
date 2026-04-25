/**
 * Relationship editor permission gate — pure logic tests.
 *
 * Phase 2 (admin entity governance Relationships section) extends the
 * existing project-editor gate so platform admins / superusers can also
 * use the relationship editorial actions from `/admin/entities/[id]`.
 *
 * The actual server actions in `src/app/actions/relationship-editorial.ts`
 * delegate to `canEditRelationship` (lib/auth/relationship-editor.ts).
 * These tests lock down that contract so a regression at the auth layer
 * is impossible to merge silently.
 *
 * See docs/features/on-going/editable-relationship-governance.md
 */

import { describe, expect, it } from "vitest";
import { canEditRelationship } from "@/lib/auth/relationship-editor";

describe("canEditRelationship — project editor flow (existing behavior)", () => {
  it("allows project owners with NO platform role", () => {
    expect(
      canEditRelationship({
        projectRole: "owner",
        platformRoles: [],
      })
    ).toBe(true);
  });

  it("allows project editors with NO platform role", () => {
    expect(
      canEditRelationship({
        projectRole: "editor",
        platformRoles: [],
      })
    ).toBe(true);
  });

  it("REJECTS project viewers with NO platform role", () => {
    expect(
      canEditRelationship({
        projectRole: "viewer",
        platformRoles: [],
      })
    ).toBe(false);
  });

  it("REJECTS users with no project role and no platform role", () => {
    expect(
      canEditRelationship({
        projectRole: null,
        platformRoles: [],
      })
    ).toBe(false);
  });
});

describe("canEditRelationship — admin governance flow (Phase 2)", () => {
  it("allows platform_admin even when NOT a project member", () => {
    expect(
      canEditRelationship({
        projectRole: null,
        platformRoles: ["platform_admin"],
      })
    ).toBe(true);
  });

  it("allows superuser even when NOT a project member", () => {
    expect(
      canEditRelationship({
        projectRole: null,
        platformRoles: ["superuser"],
      })
    ).toBe(true);
  });

  it("allows superuser who is also project viewer", () => {
    // The `viewer` membership on its own would be insufficient, but the
    // platform role grants entity-governance access independently.
    expect(
      canEditRelationship({
        projectRole: "viewer",
        platformRoles: ["superuser"],
      })
    ).toBe(true);
  });

  it("allows platform_admin who is also project viewer", () => {
    expect(
      canEditRelationship({
        projectRole: "viewer",
        platformRoles: ["platform_admin"],
      })
    ).toBe(true);
  });

  it("REJECTS users with unrelated platform roles only", () => {
    // No such role exists today, but the predicate must default to deny
    // for anything other than the explicit governance roles.
    expect(
      canEditRelationship({
        projectRole: null,
        // @ts-expect-error — exercising the deny path with an off-list role
        platformRoles: ["random_role"],
      })
    ).toBe(false);
  });
});

describe("canEditRelationship — combined paths", () => {
  it("either path is sufficient", () => {
    expect(
      canEditRelationship({
        projectRole: "editor",
        platformRoles: ["superuser"],
      })
    ).toBe(true);
  });
});
