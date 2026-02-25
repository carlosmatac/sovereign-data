"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

async function requireProjectOwner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  if (membership?.role !== "owner") throw new Error("Only project owners can manage members");

  return { user, admin };
}

export async function inviteTeamMember(
  projectId: string,
  email: string,
  role: "editor" | "viewer"
) {
  try {
    const { admin } = await requireProjectOwner(projectId);

    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return { error: "Please enter a valid email address" };
    }

    // Check for existing pending invite
    const { data: pendingInvites } = await admin
      .from("project_members")
      .select("id, invited_email")
      .eq("project_id", projectId)
      .eq("invited_email", normalizedEmail)
      .is("user_id", null);

    if (pendingInvites && pendingInvites.length > 0) {
      return { error: "An invitation has already been sent to this email" };
    }

    // Look up whether this email belongs to an existing user
    const {
      data: { users },
    } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = users.find((u) => u.email === normalizedEmail);

    if (existingUser) {
      // Check if already a member
      const { data: existingMembership } = await admin
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", existingUser.id)
        .maybeSingle();

      if (existingMembership) {
        return { error: "This user is already a member of this project" };
      }

      // Existing user — add them directly
      const { error: insertError } = await admin.from("project_members").insert({
        project_id: projectId,
        user_id: existingUser.id,
        role,
      });

      if (insertError) {
        console.error("Insert member error:", insertError);
        return { error: insertError.message };
      }

      return { success: true, status: "added" as const };
    }

    // New user — send Supabase Auth invite + create pending row
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      normalizedEmail
    );

    if (inviteError) {
      console.error("Invite error:", inviteError);
      return { error: `Failed to send invitation: ${inviteError.message}` };
    }

    const { error: insertError } = await admin.from("project_members").insert({
      project_id: projectId,
      invited_email: normalizedEmail,
      role,
    });

    if (insertError) {
      console.error("Insert pending member error:", insertError);
      return { error: insertError.message };
    }

    return { success: true, status: "invited" as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateMemberRole(
  projectId: string,
  memberId: string,
  newRole: UserRole
) {
  try {
    const { user, admin } = await requireProjectOwner(projectId);

    if (newRole === "owner") {
      return { error: "Cannot assign owner role — there can only be one owner" };
    }

    // Prevent the owner from demoting themselves
    const { data: target } = await admin
      .from("project_members")
      .select("user_id, role")
      .eq("id", memberId)
      .single();

    if (!target) return { error: "Member not found" };
    if (target.user_id === user.id) {
      return { error: "You cannot change your own role" };
    }
    if (target.role === "owner") {
      return { error: "Cannot change the owner's role" };
    }

    const { error } = await admin
      .from("project_members")
      .update({ role: newRole })
      .eq("id", memberId);

    if (error) {
      console.error("Update role error:", error);
      return { error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function removeMember(projectId: string, memberId: string) {
  try {
    const { user, admin } = await requireProjectOwner(projectId);

    const { data: target } = await admin
      .from("project_members")
      .select("user_id, role")
      .eq("id", memberId)
      .single();

    if (!target) return { error: "Member not found" };
    if (target.user_id === user.id) {
      return { error: "You cannot remove yourself from the project" };
    }
    if (target.role === "owner") {
      return { error: "Cannot remove the project owner" };
    }

    const { error } = await admin
      .from("project_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      console.error("Remove member error:", error);
      return { error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
