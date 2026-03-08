import { createClient } from "@/lib/supabase/server";
import { getUserProjectRole } from "@/lib/auth/project-role";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { STATUS_LABELS } from "@/lib/constants";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Clock,
  Hash,
  Link2,
  Mail,
  Users,
  MapPin,
  FileText,
  Newspaper,
} from "lucide-react";
import Link from "next/link";
import { InterviewStatusTracker } from "@/components/interviews/status-tracker";
import { TranscriptViewer } from "@/components/interviews/transcript-viewer";
import { CopyButton } from "@/components/interviews/copy-button";
import { DeleteInterviewButton } from "@/components/interviews/delete-interview-button";
import { EntityMentionsList } from "@/components/interviews/entity-mentions-list";
import { RecomputeCleanedTranscriptButton } from "@/components/interviews/recompute-cleaned-transcript-button";
import { normalizeTranscriptDisplay } from "@/lib/transcript/normalizeDisplay";

export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch interview with project info
  const { data: interview, error } = await supabase
    .from("interviews")
    .select("*, projects(name, country, region)")
    .eq("id", id)
    .single();

  if (error || !interview) {
    notFound();
  }

  const userRole = await getUserProjectRole(interview.project_id);
  const canEdit = userRole === "owner" || userRole === "editor";
  const isOwner = userRole === "owner";

  // Fetch entities for this interview
  const { data: mentions } = await supabase
    .from("entity_mentions")
    .select("*, entities(*)")
    .eq("interview_id", id);

  // Fetch entity relationships for this interview
  const { data: relationships } = await supabase
    .from("entity_relationships")
    .select("*")
    .eq("interview_id", id);

  // Fetch content snippets for this interview
  const { data: snippets } = await supabase
    .from("content_snippets")
    .select("*")
    .eq("interview_id", id)
    .order("platform");

  const allMentions =
    mentions
      ?.map((m) => {
        const entity = m.entities as unknown as {
          id: string;
          name: string;
          type: string;
          description: string | null;
        } | null;

        if (!entity) return null;

        return {
          mentionId: m.id,
          entityId: m.entity_id,
          name: entity.name,
          type: entity.type,
          description: entity.description,
          sentiment: m.sentiment,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null) ?? [];

  // Deduplicate: show unique entities (not repeated mention rows)
  const entityMentions = Array.from(
    allMentions
      .reduce((map, m) => {
        if (!map.has(m.entityId)) map.set(m.entityId, m);
        return map;
      }, new Map<string, (typeof allMentions)[number]>())
      .values()
  );

  const totalMentionCount = allMentions.length;

  // Build entity name lookup from mentions for relationship display.
  const entityNameMap: Record<string, { name: string; type: string }> = {};
  for (const m of entityMentions) {
    entityNameMap[m.entityId] = { name: m.name, type: m.type };
  }

  const platformIcons: Record<string, React.ReactNode> = {
    linkedin: <Briefcase className="h-3.5 w-3.5" />,
    twitter: <Hash className="h-3.5 w-3.5" />,
    newsletter: <Mail className="h-3.5 w-3.5" />,
    summary: <FileText className="h-3.5 w-3.5" />,
  };

  const statusInfo = STATUS_LABELS[interview.status] ?? {
    label: interview.status,
    variant: "secondary" as const,
  };

  const project = interview.projects as unknown as {
    name: string;
    country: string | null;
    region: string | null;
  } | null;

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m ${secs}s`;
  };

  const sentiment = interview.sentiment as {
    overall?: string;
    score?: number;
    highlights?: Array<{ text: string; sentiment: string }>;
  } | null;

  const transcriptNormalizationStats =
    interview.transcript_full
      ? normalizeTranscriptDisplay(interview.transcript_full, {
          intervieweeName: interview.interviewee_name,
          intervieweeOrg: interview.interviewee_org,
        }).stats
      : null;

  return (
    <div className="p-6">
      {/* Back navigation */}
      <div className="mb-6">
        <Link
          href="/interviews"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Interviews
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {interview.title}
            </h1>
            <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
              {project && <span>{project.name}</span>}
              {project?.country && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {project.country}
                </span>
              )}
              {interview.audio_duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(interview.audio_duration)}
                </span>
              )}
              {interview.expected_speakers != null && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {interview.expected_speakers} speakers (expected)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            {canEdit && (
              <DeleteInterviewButton
                interviewId={interview.id}
                interviewTitle={interview.title}
              />
            )}
          </div>
        </div>
        {interview.description && (
          <p className="mt-3 text-muted-foreground">{interview.description}</p>
        )}
      </div>

      {/* Pipeline Status Tracker */}
      {interview.status !== "COMPLETED" && (
        <InterviewStatusTracker
          interviewId={interview.id}
          currentStatus={interview.status}
          errorMessage={interview.error_message}
        />
      )}

      {/* Main Content Grid — only show when there's extracted data */}
      {interview.status === "COMPLETED" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Transcript + Summary */}
          <div className="space-y-6 lg:col-span-2">
            {/* Executive Summary */}
            {interview.summary && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">
                      Executive Summary
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">
                    {interview.summary}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Risks & Opportunities */}
            {interview.topics && interview.topics.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Topics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {interview.topics.map((topic) => (
                      <Badge key={topic} variant="secondary">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Marketing Assets */}
            {snippets && snippets.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Newspaper className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">
                      Marketing Assets
                    </CardTitle>
                  </div>
                  <CardDescription>
                    Auto-generated content ready for distribution
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {snippets.map((snippet) => (
                      <div key={snippet.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {platformIcons[snippet.platform] ?? (
                              <FileText className="h-3.5 w-3.5" />
                            )}
                            <span className="text-sm font-medium capitalize">
                              {snippet.platform}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-[10px] capitalize"
                            >
                              {snippet.status}
                            </Badge>
                            <CopyButton text={snippet.content} />
                          </div>
                        </div>
                        <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap leading-relaxed">
                          {snippet.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Full Transcript */}
            {interview.transcript_full && (
              <TranscriptViewer
                transcriptRaw={interview.transcript_full}
                transcriptDisplay={interview.transcript_display}
                replacementsApplied={
                  transcriptNormalizationStats?.replacementsApplied
                }
                actions={
                  isOwner ? (
                    <RecomputeCleanedTranscriptButton
                      interviewId={interview.id}
                    />
                  ) : null
                }
                speakerMap={
                  interview.speaker_map as Record<string, string>
                }
              />
            )}
          </div>

          {/* Right Column: Sidebar Intelligence */}
          <div className="space-y-6">
            {/* Sentiment */}
            {sentiment && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Sentiment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        sentiment.overall === "positive"
                          ? "bg-green-500"
                          : sentiment.overall === "negative"
                            ? "bg-red-500"
                            : sentiment.overall === "mixed"
                              ? "bg-yellow-500"
                              : "bg-gray-400"
                      }`}
                    />
                    <span className="text-sm font-medium capitalize">
                      {sentiment.overall}
                    </span>
                    {sentiment.score !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        ({sentiment.score > 0 ? "+" : ""}
                        {sentiment.score.toFixed(2)})
                      </span>
                    )}
                  </div>
                  {sentiment.highlights &&
                    sentiment.highlights.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {sentiment.highlights.map((h, i) => (
                          <div
                            key={i}
                            className="rounded-md bg-muted p-2 text-xs"
                          >
                            <span
                              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                                h.sentiment === "positive"
                                  ? "bg-green-500"
                                  : h.sentiment === "negative"
                                    ? "bg-red-500"
                                    : "bg-gray-400"
                              }`}
                            />
                            &ldquo;{h.text}&rdquo;
                          </div>
                        ))}
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

            {/* Entities */}
            {entityMentions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Entities Mentioned
                  </CardTitle>
                  <CardDescription>
                    {entityMentions.length} unique entit{entityMentions.length === 1 ? "y" : "ies"}{totalMentionCount > entityMentions.length ? ` · ${totalMentionCount} mentions` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EntityMentionsList
                    mentions={entityMentions}
                    projectId={interview.project_id}
                    canEdit={canEdit}
                  />
                </CardContent>
              </Card>
            )}

            {/* Entity Relationships */}
            {relationships && relationships.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">
                      Relationships
                    </CardTitle>
                  </div>
                  <CardDescription>
                    {relationships.length} connection{relationships.length !== 1 ? "s" : ""} identified
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {relationships.map((rel) => {
                      const source =
                        entityNameMap[rel.source_entity_id];
                      const target =
                        entityNameMap[rel.target_entity_id];
                      if (!source || !target) return null;

                      return (
                        <div
                          key={rel.id}
                          className="rounded-md border p-2.5"
                        >
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <span>{source.name}</span>
                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span>{target.name}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {rel.relation_type.replace(/_/g, " ")}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {Math.round(rel.confidence * 100)}%
                            </span>
                          </div>
                          {rel.evidence_text && (
                            <p className="mt-1.5 text-xs italic text-muted-foreground">
                              &ldquo;{rel.evidence_text}&rdquo;
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Speaker Map */}
            {interview.speaker_map &&
              Object.keys(interview.speaker_map).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Speakers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(
                        interview.speaker_map as Record<string, string>
                      ).map(([key, name]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground">{key}</span>
                          <span className="font-medium">{name}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
