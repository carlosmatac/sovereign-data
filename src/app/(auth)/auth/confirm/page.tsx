"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

function AuthConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const next = searchParams.get("next") ?? "/projects";

    async function handleAuth() {
      // ── Strategy 1: Hash fragment tokens (implicit flow) ────────
      // URL looks like: /auth/confirm#access_token=xxx&refresh_token=xxx
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error("setSession error:", error.message);
            setError(error.message);
            return;
          }
          router.replace(next);
          return;
        }
      }

      // ── Strategy 2: Token hash verification (email link) ────────
      // URL looks like: /auth/confirm?token_hash=xxx&type=magiclink
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "magiclink" | "email",
        });
        if (error) {
          console.error("verifyOtp error:", error.message);
          setError(error.message);
          return;
        }
        router.replace(next);
        return;
      }

      // ── Strategy 3: PKCE code exchange ──────────────────────────
      // URL looks like: /auth/confirm?code=xxx
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("exchangeCodeForSession error:", error.message);
          setError(error.message);
          return;
        }
        router.replace(next);
        return;
      }

      // ── Strategy 4: Session might already exist ─────────────────
      // (auto-detected by Supabase client from URL or cookies)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace(next);
        return;
      }

      // Nothing worked
      setError(
        "Could not complete sign-in. Please request a new magic link from the login page."
      );
    }

    handleAuth();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-md text-center">
          <p className="text-sm text-destructive">{error}</p>
          <a
            href="/login"
            className="mt-4 inline-block text-sm text-primary underline"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AuthConfirmInner />
    </Suspense>
  );
}
