"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchPlatformRolesForUser,
  canManageGlobalPlatformRoles,
} from "@/lib/auth/platform-roles";
import type { PlatformRole } from "@/types/database";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ELEVATED_ROLES: PlatformRole[] = ["platform_admin", "superuser"];

async function requireCallerSuperuser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" as const, user: null, admin: null };
  }

  const roles = await fetchPlatformRolesForUser(supabase, user.id);
  if (!canManageGlobalPlatformRoles(roles)) {
    return { error: "Forbidden" as const, user: null, admin: null };
  }

  return { error: null, user, admin: createAdminClient() };
}

async function countSuperusers(
  admin: ReturnType<typeof createAdminClient>
): Promise<number> {
  const { count, error } = await admin
    .from("user_platform_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "superuser");

  if (error) {
    console.error("countSuperusers:", error);
    return 0;
  }
  return count ?? 0;
}

async function ensureMemberRow(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data: existing } = await admin
    .from("user_platform_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "member")
    .maybeSingle();

  if (existing) return;

  const { error } = await admin.from("user_platform_roles").insert({
    user_id: userId,
    role: "member",
  });

  if (error && error.code !== "23505") {
    console.error("ensureMemberRow:", error);
  }
}

function revalidateAdminPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/entities");
}

export async function grantPlatformRole(
  targetUserId: string,
  role: "platform_admin" | "superuser"
) {
  try {
    if (!UUID_RE.test(targetUserId)) {
      return { error: "Invalid user id" };
    }

    if (!ELEVATED_ROLES.includes(role)) {
      return { error: "Invalid role" };
    }

    const ctx = await requireCallerSuperuser();
    if (ctx.error || !ctx.admin) {
      return { error: ctx.error ?? "Forbidden" };
    }

    const { data: authData, error: authErr } =
      await ctx.admin.auth.admin.getUserById(targetUserId);
    if (authErr || !authData.user) {
      return { error: "User not found" };
    }

    await ensureMemberRow(ctx.admin, targetUserId);

    const { data: already } = await ctx.admin
      .from("user_platform_roles")
      .select("user_id")
      .eq("user_id", targetUserId)
      .eq("role", role)
      .maybeSingle();

    if (already) {
      revalidateAdminPaths();
      return { success: true as const };
    }

    const { error: insertError } = await ctx.admin
      .from("user_platform_roles")
      .insert({ user_id: targetUserId, role });

    if (insertError) {
      if (insertError.code === "23505") {
        revalidateAdminPaths();
        return { success: true as const };
      }
      console.error("grantPlatformRole:", insertError);
      return { error: insertError.message };
    }

    revalidateAdminPaths();
    return { success: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function revokePlatformRole(
  targetUserId: string,
  role: "platform_admin" | "superuser"
) {
  try {
    if (!UUID_RE.test(targetUserId)) {
      return { error: "Invalid user id" };
    }

    if (!ELEVATED_ROLES.includes(role)) {
      return { error: "Invalid role" };
    }

    const ctx = await requireCallerSuperuser();
    if (ctx.error || !ctx.admin) {
      return { error: ctx.error ?? "Forbidden" };
    }

    const { data: hasRole } = await ctx.admin
      .from("user_platform_roles")
      .select("user_id")
      .eq("user_id", targetUserId)
      .eq("role", role)
      .maybeSingle();

    if (!hasRole) {
      revalidateAdminPaths();
      return { success: true as const };
    }

    if (role === "superuser") {
      const superCount = await countSuperusers(ctx.admin);
      if (superCount <= 1) {
        return {
          error:
            "Cannot remove the last superuser. Grant superuser to another account first, or use break-glass SQL in Supabase.",
        };
      }
    }

    const { error: delError } = await ctx.admin
      .from("user_platform_roles")
      .delete()
      .eq("user_id", targetUserId)
      .eq("role", role);

    if (delError) {
      console.error("revokePlatformRole:", delError);
      return { error: delError.message };
    }

    revalidateAdminPaths();
    return { success: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
