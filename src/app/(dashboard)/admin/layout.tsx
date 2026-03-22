import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPlatformRolesForUser,
  hasPlatformAdminRole,
} from "@/lib/auth/platform-roles";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export default async function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const roles = await fetchPlatformRolesForUser(supabase, user.id);
  if (!hasPlatformAdminRole(roles)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">
            Access restricted
          </h1>
          <p className="text-muted-foreground text-sm">
            Platform administrator access is required. Project ownership does not
            grant this automatically.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
