import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

/**
 * Returns the current authenticated user's role in a project,
 * or null if they are not a member.
 *
 * Uses the admin client to avoid RLS issues with auth.uid() in
 * PostgREST context — the same pattern used across all mutations.
 */
export async function getUserProjectRole(
  projectId: string
): Promise<UserRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  return data?.role ?? null;
}

/**
 * Returns the authenticated user, or null.
 * Thin wrapper to avoid repeating the cookie client boilerplate.
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
