import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, PlatformRole } from "@/types/database";

/**
 * Load platform roles for a user via the session client (RLS: own rows only).
 */
export async function fetchPlatformRolesForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<PlatformRole[]> {
  const { data, error } = await supabase
    .from("user_platform_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    console.error("fetchPlatformRolesForUser:", error.message);
    return [];
  }

  return (data ?? []).map((row) => row.role);
}

/** Global role management (grant/revoke platform_admin & superuser). Superuser only. */
export function canManageGlobalPlatformRoles(roles: PlatformRole[]): boolean {
  return roles.includes("superuser");
}

/**
 * Entity / knowledge governance (canonical entities, KB ops).
 * platform_admin OR superuser (superuser includes this capability).
 */
export function hasEntityGovernanceAccess(roles: PlatformRole[]): boolean {
  return roles.includes("platform_admin") || roles.includes("superuser");
}

/**
 * Any Platform Administration area (sidebar link, /admin layout).
 * Same as entity governance for route access; user/role UI adds superuser-only gate inside.
 */
export function hasPlatformAdministrationAccess(
  roles: PlatformRole[]
): boolean {
  return hasEntityGovernanceAccess(roles);
}

/**
 * Server actions / routes: caller must be superuser (user & role management).
 */
export async function requireSuperuser(
  supabase: SupabaseClient<Database>
): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const roles = await fetchPlatformRolesForUser(supabase, user.id);
  if (!canManageGlobalPlatformRoles(roles)) {
    throw new Error("Forbidden");
  }

  return user;
}

/**
 * Server routes: caller must access entity/knowledge governance surfaces.
 */
export async function requireEntityGovernanceUser(
  supabase: SupabaseClient<Database>
): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const roles = await fetchPlatformRolesForUser(supabase, user.id);
  if (!hasEntityGovernanceAccess(roles)) {
    throw new Error("Forbidden");
  }

  return user;
}
