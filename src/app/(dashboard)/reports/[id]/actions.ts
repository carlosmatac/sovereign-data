"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes, createHash } from "crypto";

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

async function requireReportEditor(reportId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: report } = await admin
    .from("reports")
    .select("id, project_id")
    .eq("id", reportId)
    .single();

  if (!report) throw new Error("Report not found");

  const { data: membership } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", report.project_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role === "viewer") {
    throw new Error("Insufficient permissions");
  }

  return { admin, report };
}

export async function shareReport(
  reportId: string,
  password?: string
): Promise<{ error?: string; token?: string }> {
  try {
    const { admin } = await requireReportEditor(reportId);

    const token = generateToken();
    const hashedPassword = password?.trim()
      ? hashPassword(password.trim())
      : null;

    const { error } = await admin
      .from("reports")
      .update({
        share_token: token,
        share_password: hashedPassword,
      })
      .eq("id", reportId);

    if (error) {
      console.error("Share report error:", error);
      return { error: error.message };
    }

    return { token };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function unshareReport(
  reportId: string
): Promise<{ error?: string }> {
  try {
    const { admin } = await requireReportEditor(reportId);

    const { error } = await admin
      .from("reports")
      .update({
        share_token: null,
        share_password: null,
      })
      .eq("id", reportId);

    if (error) {
      console.error("Unshare report error:", error);
      return { error: error.message };
    }

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
