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

export function hasPlatformAdminRole(roles: PlatformRole[]): boolean {
  return roles.includes("platform_admin");
}

/**
 * For server actions / route handlers: after verifying the user, require platform admin or throw.
 */
export async function requirePlatformAdminUser(
  supabase: SupabaseClient<Database>
): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const roles = await fetchPlatformRolesForUser(supabase, user.id);
  if (!hasPlatformAdminRole(roles)) {
    throw new Error("Forbidden");
  }

  return user;
}
