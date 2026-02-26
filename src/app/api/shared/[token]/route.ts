import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const admin = createAdminClient();

  const { data: report } = await admin
    .from("reports")
    .select("title, template, content, created_at, share_password, projects(name, country)")
    .eq("share_token", token)
    .eq("status", "completed")
    .single();

  if (!report || !report.content) {
    return NextResponse.json(
      { error: "Report not found or no longer shared" },
      { status: 404 }
    );
  }

  if (report.share_password) {
    const password = request.nextUrl.searchParams.get("password");
    if (!password) {
      return NextResponse.json(
        { error: "Password required" },
        { status: 401 }
      );
    }
    if (hashPassword(password) !== report.share_password) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 }
      );
    }
  }

  const project = report.projects as unknown as {
    name: string;
    country: string | null;
  } | null;

  return NextResponse.json({
    title: report.title,
    template: report.template,
    content: report.content,
    created_at: report.created_at,
    project_name: project?.name ?? "Unknown",
    country: project?.country ?? null,
  });
}
