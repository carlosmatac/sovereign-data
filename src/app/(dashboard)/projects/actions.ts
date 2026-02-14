"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export async function createProject(formData: FormData) {
  // 1. Verify user identity via cookie-based client
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // 2. Parse form data
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const country = formData.get("country") as string;
  const region = formData.get("region") as string;

  if (!name?.trim()) {
    return { error: "Project name is required" };
  }

  // 3. Use admin client for the INSERT (bypasses RLS).
  //    Safe because we've already verified the user above.
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("projects")
    .insert({
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
