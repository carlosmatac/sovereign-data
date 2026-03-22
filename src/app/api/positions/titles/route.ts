import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listDistinctPositionTitles } from "@/lib/positions/query-validated-positions";

/**
 * GET /api/positions/titles
 * Distinct validated position titles for admin autocomplete (read-only).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const titles = await listDistinctPositionTitles(admin, 200);
  return NextResponse.json({ titles });
}
