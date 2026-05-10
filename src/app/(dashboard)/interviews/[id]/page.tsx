import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import {
  STATUS_LABELS,
  AUDIO_STORAGE_BUCKET,
  AUDIO_PLAYER_SIGNED_URL_TTL,
} from "@/lib/constants";
import {
  ArrowLeft,
  Briefcase,
  Clock,
  Hash,
  Link2,
  Mail,
  Users,
  MapPin,
  FileText,
  Newspaper,
  FileIcon,
  ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InterviewStatusTracker } from "@/components/interviews/status-tracker";
import { TranscriptViewer } from "@/components/interviews/transcript-viewer";
import { CopyButton } from "@/components/interviews/copy-button";
import { DeleteInterviewButton } from "@/components/interviews/delete-interview-button";
import { EntityMentionsList } from "@/components/interviews/entity-mentions-list";
import { AudioPlayer } from "@/components/interviews/audio-player";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { resolveTranscriptTextForInterviewViewer } from "@/lib/interviews/transcript-utterances-from-full";
import { EditableSpeakersCard } from "@/components/interviews/editable-speakers-card";
import { EditableInterviewTitle } from "@/components/interviews/editable-interview-title";
import {
  RelationshipsList,
  type RelationshipListItem,
} from "@/components/interviews/relationships-list";
import { IconWell } from "@/components/panels";
import type {
  RelationType,
  RelationshipOrigin,
  RelationshipReviewStatus,
  SpeakerMap,
} from "@/types/database";

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

  // Resolve audio playback URL: private bucket → signed URL; legacy → public URL.
  let audioPlaybackUrl: string | null = interview.audio_url ?? null;
  if (interview.audio_storage_path) {
    const admin = createAdminClient();
    const { data: signedData } = await admin.storage
      .from(AUDIO_STORAGE_BUCKET)
      .createSignedUrl(interview.audio_storage_path, AUDIO_PLAYER_SIGNED_URL_TTL);
    audioPlaybackUrl = signedData?.signedUrl ?? null;
  }

  const userRole = await getUserProjectRole(interview.project_id);
  const canEdit = userRole === "owner" || userRole === "editor";

  const transcriptForViewer = resolveTranscriptTextForInterviewViewer({
    transcript_full: interview.transcript_full,
    transcript_display: interview.transcript_display,
    reviewed_utterances: interview.reviewed_utterances,
    last_intel_source: interview.last_intel_source,
    speaker_map: (interview.speaker_map as SpeakerMap) ?? {},
    interviewee_name: interview.interviewee_name,
    interviewee_org: interview.interviewee_org,
  });

  // Fetch entities for this interview
  const { data: mentions } = await supabase
    .from("entity_mentions")
    .select("*, entities(*)")
    .eq("interview_id", id);

  // Fetch entity relationships for this interview (incl. editorial state).
  const { data: relationships } = await supabase
    .from("entity_relationships")
    .select(
      "id, source_entity_id, target_entity_id, relation_type, confidence, evidence_text, review_status, origin"
    )
    .eq("interview_id", id);

  const relationshipItems: RelationshipListItem[] = (relationships ?? []).map(
    (r) => ({
      id: r.id,
      source_entity_id: r.source_entity_id,
      target_entity_id: r.target_entity_id,
      relation_type: r.relation_type as RelationType,
      confidence: r.confidence,
      evidence_text: r.evidence_text,
      review_status: r.review_status as RelationshipReviewStatus,
      origin: r.origin as RelationshipOrigin,
    })
  );

  // Marketing snippets (optional UI — see FEATURE_FLAGS + docs/features/done/interview-ui-visibility.md)
  const { data: snippets } = FEATURE_FLAGS.interviewMarketingAssetsUi
    ? await supabase
        .from("content_snippets")
        .select("*")
        .eq("interview_id", id)
        .order("platform")
    : { data: null };

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

  return (
    <div className="p-6">
      {/* Back navigation */}
      <div className="mb-6">
        <Link
          href="/interviews"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Knowledge
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <EditableInterviewTitle
              interviewId={interview.id}
              initialTitle={interview.title}
              canEdit={canEdit}
            />
            <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
              {project && <span>{project.name}</span>}
              {project?.country && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {project.country}
                </span>
              )}
              {interview.source_type === "document" ? (
                <span className="flex items-center gap-1">
                  <FileIcon className="h-3.5 w-3.5" />
                  PDF Document
                </span>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            {interview.last_intel_source === "human_review" && (
              <Badge
                variant="outline"
                className="gap-1 border-[rgba(74,222,128,0.28)] bg-[rgba(74,222,128,0.06)] text-[rgba(167,243,208,0.92)]"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Human-reviewed knowledge
              </Badge>
            )}
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
        {interview.interviewee_title?.trim() && (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-medium text-foreground">Role (upload):</span>{" "}
              {interview.interviewee_title.trim()}
            </span>
          </p>
        )}
      </div>

      {/* Audio Player — only for audio source interviews */}
      {interview.source_type !== "document" && audioPlaybackUrl && (
        <div className="mb-6">
          <AudioPlayer src={audioPlaybackUrl} />
        </div>
      )}

      {/* Pipeline Status Tracker */}
      {interview.status !== "COMPLETED" && (
        <InterviewStatusTracker
          interviewId={interview.id}
          currentStatus={interview.status}
          errorMessage={interview.error_message}
          sourceType={interview.source_type}
        />
      )}

      {/* Main Content Grid — only show when there's extracted data */}
      {interview.status === "COMPLETED" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Transcript + Summary */}
          <div className="space-y-6 lg:col-span-2">
            {/*
             * Executive Summary — the most prominent content block on the
             * page. It carries a subtle Sovereign-blue accent (border tint
             * + faint background tint + leading IconWell) so it reads as
             * the page's primary takeaway without becoming a colourful
             * tile. All other knowledge cards stay neutral on purpose
             * so this one keeps its visual weight.
             */}
            {interview.summary && (
              <Card className="border-[rgba(91,156,246,0.20)] bg-[rgba(91,156,246,0.03)]">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2.5">
                    <IconWell accent="#5B9CF6" size={26}>
                      <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </IconWell>
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

            {/* Marketing Assets — gated for demo; backend generation unchanged */}
            {FEATURE_FLAGS.interviewMarketingAssetsUi &&
              snippets &&
              snippets.length > 0 && (
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

            {/* Full Transcript — after human review reprocess, text matches reviewed_utterances (via transcript_display); raw ASR stays in transcript_full */}
            {transcriptForViewer && (
              <TranscriptViewer
                transcriptRaw={transcriptForViewer}
                actions={
                  canEdit ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/interviews/${interview.id}/review`}>
                        Transcript review
                      </Link>
                    </Button>
                  ) : null
                }
                speakerMap={
                  interview.speaker_map as Record<string, string>
                }
              />
            )}
          </div>

          {/*
           * Right Column: Knowledge sidebar.
           *
           * Bounded so it can't dictate the entire page height when an
           * interview has many entities (the previous layout grew
           * indefinitely, leaving a long sidebar dwarfing a short
           * transcript). Two layered constraints:
           *
           *   1. Column is sticky to the top of the scroll region on
           *      `lg+` and bounded to the viewport (`max-h-[calc(100vh-2rem)]`)
           *      with its own internal scroll. So when the user scrolls
           *      the long left column (transcript), the sidebar stays
           *      in view; if the sidebar's own content exceeds the
           *      viewport, it scrolls inside itself.
           *   2. The entities and relationships cards are *additionally*
           *      capped (max-h on `CardContent`) with internal scroll,
           *      so a single huge entity list never pushes the smaller
           *      cards (sentiment, speaker map) below the fold.
           *
           * On `<lg` the column flows normally underneath the main
           * content; sticky/bounded behaviour only kicks in at the
           * 2-column breakpoint.
           */}
          <div className="space-y-6 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto sv-scroll-soft">
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

            {/*
             * Entities — bounded card with internal scroll.
             *
             * `max-h-[40vh]` keeps the card from dominating the
             * sidebar even when there are 50+ entities; the inner
             * list scrolls with the same restrained scrollbar
             * vocabulary used elsewhere (`sv-scroll-soft`). The
             * `pr-1` reserves room for the scrollbar so rows don't
             * jitter on overflow appearance.
             */}
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
                <CardContent className="sv-scroll-soft max-h-[40vh] overflow-y-auto pr-1">
                  <EntityMentionsList
                    mentions={entityMentions}
                    projectId={interview.project_id}
                    canEdit={canEdit}
                  />
                </CardContent>
              </Card>
            )}

            {/* Entity Relationships — also bounded (smaller cap; the
              * relationship list tends to be 1-2 lines per row and
              * benefits from a tighter ceiling). */}
            {relationshipItems.length > 0 && (
              <Card id="relationships" className="scroll-mt-20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-[#8EB6F3]" />
                    <CardTitle className="text-base">
                      Relationships
                    </CardTitle>
                  </div>
                  <CardDescription>
                    {relationshipItems.length} connection{relationshipItems.length !== 1 ? "s" : ""} identified
                    {canEdit ? " · editor controls available" : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="sv-scroll-soft max-h-[32vh] overflow-y-auto pr-1">
                  <RelationshipsList
                    relationships={relationshipItems}
                    entityNameMap={entityNameMap}
                    canEdit={canEdit}
                  />
                </CardContent>
              </Card>
            )}

            {/* Speaker Map — only for audio interviews with diarization data */}
            {interview.source_type !== "document" &&
              interview.speaker_map &&
              Object.keys(interview.speaker_map).length > 0 && (
                <EditableSpeakersCard
                  interviewId={interview.id}
                  projectId={interview.project_id}
                  initialSpeakerMap={
                    (interview.speaker_map as SpeakerMap) ?? {}
                  }
                  canEdit={canEdit}
                />
              )}
          </div>
        </div>
      )}
    </div>
  );
}
