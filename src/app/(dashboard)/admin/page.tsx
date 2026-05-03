import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPlatformRolesForUser,
  canManageGlobalPlatformRoles,
  hasEntityGovernanceAccess,
} from "@/lib/auth/platform-roles";
import { Database, Shield, Users } from "lucide-react";
import { IconWell } from "@/components/panels";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const roles = await fetchPlatformRolesForUser(supabase, user.id);
  const entityGov = hasEntityGovernanceAccess(roles);
  const superuser = canManageGlobalPlatformRoles(roles);

  if (!entityGov) {
    redirect("/projects");
  }

  // platform_admin only: single destination — entity & knowledge governance
  if (!superuser) {
    redirect("/admin/entities");
  }

  // Superuser: two operational areas — hub (no empty placeholder)
  return (
    <div className="mx-auto max-w-3xl space-y-7 px-5 py-6 md:px-10 md:py-10">
      <div>
        <p
          className="mb-1.5 text-[11px] font-semibold uppercase"
          style={{
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.42)",
          }}
        >
          Aksum · Administration
        </p>
        <h1
          className="text-[28px] font-semibold text-white"
          style={{ letterSpacing: "-0.020em", lineHeight: 1.05 }}
        >
          Platform Administration
        </h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-[1.6] text-white/62">
          Operator tools for this deployment. User and role changes are
          separate from knowledge-base governance — use the section that
          matches the task.
        </p>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <AdminTile
          href="/admin/users"
          icon={
            <Users
              className="h-[16px] w-[16px]"
              style={{ color: "#A78BFA" }}
              strokeWidth={1.6}
            />
          }
          accent="#A78BFA"
          title="Users & global roles"
          description={
            <>
              Search accounts, grant or revoke{" "}
              <code className="rounded bg-white/5 px-1 py-[1px] text-[11px] text-white/78">
                platform_admin
              </code>{" "}
              and{" "}
              <code className="rounded bg-white/5 px-1 py-[1px] text-[11px] text-white/78">
                superuser
              </code>
              . Superuser only.
            </>
          }
        />

        <AdminTile
          href="/admin/entities"
          icon={
            <Database
              className="h-[16px] w-[16px]"
              style={{ color: "#5B9CF6" }}
              strokeWidth={1.6}
            />
          }
          accent="#5B9CF6"
          title="Entity & knowledge governance"
          description={
            <>
              Search canonical entities, edit names/descriptions/types, and
              manage aliases (platform admin or superuser).
            </>
          }
        />
      </div>

      <p className="flex items-start gap-2 text-[12px] leading-[1.6] text-white/55">
        <Shield className="mt-[2px] h-[13px] w-[13px] shrink-0" strokeWidth={1.6} />
        <span>
          <span className="font-medium text-white/82">Superuser</span> can use
          both areas.{" "}
          <span className="font-medium text-white/82">Platform admin</span>{" "}
          (without superuser) is routed here only for entity governance — not
          for global role management.
        </span>
      </p>
    </div>
  );
}

function AdminTile({
  href,
  icon,
  accent,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  accent: string;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="sv-hover-card group block rounded-[6px] border border-[rgba(147,147,147,0.14)] bg-[#0B0E14] p-5"
    >
      <IconWell accent={accent} size={38}>
        {icon}
      </IconWell>
      <p className="mt-3.5 text-[14px] font-semibold text-white/92">{title}</p>
      <p className="mt-1.5 text-[12px] leading-[1.55] text-white/60">
        {description}
      </p>
    </Link>
  );
}
