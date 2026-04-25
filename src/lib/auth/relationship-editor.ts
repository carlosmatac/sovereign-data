import type { PlatformRole, UserRole } from "@/types/database";
import { hasEntityGovernanceAccess } from "@/lib/auth/platform-roles";

/**
 * Pure permission predicate for editing a relationship row.
 *
 * Lives in a non-`"use server"` module so:
 *   1. Next.js Server Actions runtime doesn't try to wrap it as an async
 *      RPC (Server Action files only allow async exports).
 *   2. Unit tests can lock the rule down without spinning up Supabase.
 *
 * Two valid auth paths (mirrors `requireRelationshipEditor` in
 * `src/app/actions/relationship-editorial.ts`):
 *
 *   - Project owner / editor for the interview's project (existing
 *     interview-detail editor flow).
 *   - `platform_admin` / `superuser` (Phase 2 admin entity governance
 *     Relationships section).
 *
 * `viewer` project role is NOT sufficient on its own.
 */
export function canEditRelationship(input: {
  projectRole: UserRole | null;
  platformRoles: PlatformRole[];
}): boolean {
  if (input.projectRole === "owner" || input.projectRole === "editor") {
    return true;
  }
  if (hasEntityGovernanceAccess(input.platformRoles)) {
    return true;
  }
  return false;
}
