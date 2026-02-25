import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProjectRole, getAuthUser } from "@/lib/auth/project-role";
import { MemberList } from "@/components/projects/member-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectMembersPage({ params }: Props) {
  const { id: projectId } = await params;

  const user = await getAuthUser();
  if (!user) notFound();

  const role = await getUserProjectRole(projectId);
  if (!role) notFound();

  const admin = createAdminClient();

  // Fetch the project name
  const { data: project } = await admin
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  if (role !== "owner") {
    return (
      <div className="p-6">
        <div className="mb-6">
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Project
          </Link>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <ShieldAlert className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">Access Restricted</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Only project owners can manage team members.
            </p>
            <Button className="mt-4" variant="outline" asChild>
              <Link href={`/projects/${projectId}`}>Go Back</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch all members with their profile info
  const { data: members } = await admin
    .from("project_members")
    .select("id, user_id, role, invited_email, created_at, profiles(id, full_name)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  // Resolve emails for active members via auth admin API
  const enrichedMembers = await Promise.all(
    (members ?? []).map(async (m) => {
      let email: string | null = m.invited_email;
      if (m.user_id) {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        email = data?.user?.email ?? null;
      }
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        invited_email: m.invited_email,
        created_at: m.created_at,
        profile: profile ?? null,
        email,
      };
    })
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Project
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
        <p className="mt-1 text-muted-foreground">
          Manage who has access to <span className="font-medium">{project.name}</span>.
        </p>
      </div>

      <MemberList projectId={projectId} members={enrichedMembers} />
    </div>
  );
}
