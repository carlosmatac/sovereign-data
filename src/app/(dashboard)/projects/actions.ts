"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProjectRole } from "@/lib/auth/project-role";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const country = formData.get("country") as string;
  const region = formData.get("region") as string;

  if (!name?.trim()) {
    return { error: "Project name is required" };
  }

  const admin = createAdminClient();

  // Resolve the creator's tenant — every project is owned by exactly one
  // tenant. New customers are bootstrapped via SQL/admin tools; the UI does
  // not expose a tenant picker yet, so we use the user's first membership.
  const { data: membership, error: tenantError } = await admin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (tenantError || !membership) {
    return { error: "No tenant membership found for user" };
  }

  const { data, error } = await admin
    .from("projects")
    .insert({
      tenant_id: membership.tenant_id,
      name: name.trim(),
      description: description?.trim() || null,
      country: country?.trim() || null,
      region: region || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Create project error:", error);
    return { error: error.message };
  }

  redirect(`/interviews?project=${data.id}`);
}

export async function updateProject(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const role = await getUserProjectRole(projectId);
  if (role !== "owner") {
    return { error: "Only the project owner can edit project details" };
  }

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const country = formData.get("country") as string;
  const region = formData.get("region") as string;

  if (!name?.trim()) {
    return { error: "Project name is required" };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("projects")
    .update({
      name: name.trim(),
      description: description?.trim() || null,
      country: country?.trim() || null,
      region: region || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) {
    console.error("Update project error:", error);
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { success: true };
}
