import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProjectRole, getAuthUser } from "@/lib/auth/project-role";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  MapPin,
  Mic,
  Users,
  Calendar,
  Upload,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id: projectId } = await params;

  const user = await getAuthUser();
  if (!user) notFound();

  const role = await getUserProjectRole(projectId);
  if (!role) notFound();

  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  // Fetch counts
  const [interviewRes, memberRes] = await Promise.all([
    admin
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("project_members")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .not("user_id", "is", null),
  ]);

  const interviewCount = interviewRes.count ?? 0;
  const memberCount = memberRes.count ?? 0;
  const canEdit = role === "owner" || role === "editor";

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/projects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Projects
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {project.name}
            </h1>
            {project.region && (
              <Badge variant="secondary">{project.region}</Badge>
            )}
          </div>
          {project.description && (
            <p className="mt-2 max-w-2xl text-muted-foreground">
              {project.description}
            </p>
          )}
          <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
            {project.country && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {project.country}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Created {new Date(project.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {canEdit && (
            <Button asChild>
              <Link href={`/interviews/upload?project=${projectId}`}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Interview
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Link href={`/interviews?project=${projectId}`}>
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Interviews</CardTitle>
              <Mic className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{interviewCount}</div>
              <p className="text-xs text-muted-foreground">
                View all interviews
              </p>
            </CardContent>
          </Card>
        </Link>

        {role === "owner" ? (
          <Link href={`/projects/${projectId}/members`}>
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Team Members
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{memberCount}</div>
                <p className="text-xs text-muted-foreground">
                  Manage team access
                </p>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Team Members
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{memberCount}</div>
              <p className="text-xs text-muted-foreground">Active members</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Your Role</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{role}</div>
            <p className="text-xs text-muted-foreground">
              {role === "owner"
                ? "Full project control"
                : role === "editor"
                  ? "Can upload & edit interviews"
                  : "Read-only access"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks for this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link href={`/interviews?project=${projectId}`}>
              <Mic className="mr-2 h-4 w-4" />
              View Interviews
            </Link>
          </Button>
          {canEdit && (
            <Button variant="outline" asChild>
              <Link href={`/interviews/upload?project=${projectId}`}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Interview
              </Link>
            </Button>
          )}
          {role === "owner" && (
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/members`}>
                <Users className="mr-2 h-4 w-4" />
                Manage Team
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
