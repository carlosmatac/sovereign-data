import { NextResponse } from "next/server";

/**
 * GET /auth/callback
 *
 * Supabase redirects here after the user clicks a magic link.
 * Different flows send different params:
 *   - PKCE: ?code=xxx
 *   - Token hash: ?token_hash=xxx&type=magiclink
 *   - Implicit: #access_token=xxx (hash, never reaches server)
 *
 * We forward ALL query params to the client-side /auth/confirm page,
 * which handles every flow variant.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/projects";

  // Build the confirm URL preserving all original params
  const confirmUrl = new URL("/auth/confirm", url.origin);
  url.searchParams.forEach((value, key) => {
    confirmUrl.searchParams.set(key, value);
  });
  // Ensure "next" is always present
  confirmUrl.searchParams.set("next", next);

  return NextResponse.redirect(confirmUrl.toString());
}
