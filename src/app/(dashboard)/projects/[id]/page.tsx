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
import {
  ArrowLeft,
  BookOpen,
  MapPin,
  MessageSquare,
  Users,
  Calendar,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { ProjectInterviewsSection } from "@/components/projects/project-interviews-section";
import { SalesWarRoom } from "./war-room";
import { SectionChip } from "@/components/panels";
import { regionColor } from "@/lib/region-colors";

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

  const [interviewsRes, memberRes] = await Promise.all([
    admin
      .from("interviews")
      .select("id, title, status, audio_duration, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    admin
      .from("project_members")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .not("user_id", "is", null),
  ]);

  const interviews = interviewsRes.data ?? [];
  const interviewCount = interviews.length;
  const memberCount = memberRes.count ?? 0;
  const canEdit = role === "owner" || role === "editor";

  return (
    <div className="px-5 py-6 lg:px-8 lg:py-7">
      <div className="mb-5">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-white/55 transition-colors duration-150 hover:text-white/92"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          Back to Projects
        </Link>
      </div>

      {/* Header */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <p
            className="mb-1.5 text-[11px] font-semibold uppercase"
            style={{
              letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.42)",
            }}
          >
            Project
          </p>
          <div className="flex items-center gap-3">
            <h1
              className="text-[28px] font-semibold text-white"
              style={{ letterSpacing: "-0.020em", lineHeight: 1.05 }}
            >
              {project.name}
            </h1>
            {project.region && (
              <SectionChip
                tone="accent"
                color={regionColor(project.region)}
                dot
              >
                {project.region}
              </SectionChip>
            )}
          </div>
          {project.description && (
            <p className="mt-2 max-w-2xl text-[13px] leading-[1.6] text-white/62">
              {project.description}
            </p>
          )}
          <div className="mt-3 flex items-center gap-3 text-[12px] text-white/50">
            {project.country && (
              <span className="flex items-center gap-1">
                <MapPin className="h-[12px] w-[12px]" strokeWidth={1.5} />
                {project.country}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-[12px] w-[12px]" strokeWidth={1.5} />
              Created {new Date(project.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {role === "owner" && (
            <EditProjectDialog project={project} />
          )}
          <Button asChild variant="outline">
            <Link href={`/chat/new?project=${projectId}`}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Copilot
            </Link>
          </Button>
          {canEdit && (
            <Button asChild>
              <Link href={`/interviews/upload?project=${projectId}`}>
                <Upload className="mr-2 h-4 w-4" />
                Add Source
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Two-column layout: War Room (left) + Project Ops (right) */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ── Sales War Room ─────────────────────────────────────── */}
        <section className="space-y-5">
          <h2
            className="text-[12px] font-semibold uppercase text-white/82"
            style={{ letterSpacing: "0.1em" }}
          >
            Sales War Room
          </h2>
          <SalesWarRoom projectId={projectId} />
          <ProjectInterviewsSection
            interviews={interviews}
            projectId={projectId}
            canEdit={canEdit}
          />
        </section>

        {/* ── Project Ops (sidebar) ──────────────────────────────── */}
        <section>
          <h2
            className="mb-4 text-[12px] font-semibold uppercase text-white/82"
            style={{ letterSpacing: "0.1em" }}
          >
            Project Ops
          </h2>
          <div className="space-y-4">
            {/* Stats Cards */}
            <Link href={`/interviews?project=${projectId}`}>
              <Card className="sv-hover-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    Knowledge
                  </CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{interviewCount}</div>
                  <p className="text-xs text-muted-foreground">
                    View all knowledge
                  </p>
                </CardContent>
              </Card>
            </Link>

            {role === "owner" ? (
              <Link href={`/projects/${projectId}/members`}>
                <Card className="sv-hover-card">
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
              <Card className="sv-hover-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    Team Members
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{memberCount}</div>
                  <p className="text-xs text-muted-foreground">
                    Active members
                  </p>
                </CardContent>
              </Card>
            )}

            <Card className="sv-hover-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Your Role
                </CardTitle>
                <img src="/ak.svg" alt="" aria-hidden className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize">{role}</div>
                <p className="text-xs text-muted-foreground">
                  {role === "owner"
                    ? "Full project control"
                    : role === "editor"
                      ? "Can add & edit sources"
                      : "Read-only access"}
                </p>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="sv-hover-card">
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Quick Actions
                </CardTitle>
                <CardDescription>
                  Common tasks for this project.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="outline" size="sm" asChild className="justify-start">
                  <Link href={`/interviews?project=${projectId}`}>
                    <BookOpen className="mr-2 h-4 w-4" />
                    View Knowledge
                  </Link>
                </Button>
                {canEdit && (
                  <Button variant="outline" size="sm" asChild className="justify-start">
                    <Link href={`/interviews/upload?project=${projectId}`}>
                      <Upload className="mr-2 h-4 w-4" />
                      Add Source
                    </Link>
                  </Button>
                )}
                {role === "owner" && (
                  <Button variant="outline" size="sm" asChild className="justify-start">
                    <Link href={`/projects/${projectId}/members`}>
                      <Users className="mr-2 h-4 w-4" />
                      Manage Team
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
