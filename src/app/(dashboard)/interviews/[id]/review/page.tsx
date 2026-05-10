import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProjectRole } from "@/lib/auth/project-role";
import {
  AUDIO_STORAGE_BUCKET,
  AUDIO_PLAYER_SIGNED_URL_TTL,
} from "@/lib/constants";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TranscriptReviewEditor,
  type ExtractedEntity,
  type ReviewSeedRow,
} from "@/components/interviews/transcript-review-editor";
import {
  parseTextInterviewToUtterances,
  parseTranscriptFullToUtterances,
  sourceUtterancesToReviewedUtterances,
} from "@/lib/interviews/transcript-utterances-from-full";
import type { TextStructureType } from "@/lib/ai/chunking-text-interview";
import type {
  InterviewStatus,
  ReviewedUtterance,
  SourceType,
  SourceUtterance,
  SpeakerMap,
} from "@/types/database";

const VALID_TEXT_STRUCTURES: ReadonlySet<TextStructureType> = new Set([
  "qa_structured",
  "speaker_transcript",
  "article_style",
  "freeform",
]);

function readStructureHint(meta: unknown): TextStructureType | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const v = (meta as Record<string, unknown>).structure_type;
  if (typeof v !== "string") return undefined;
  return VALID_TEXT_STRUCTURES.has(v as TextStructureType)
    ? (v as TextStructureType)
    : undefined;
}

function isStoredReviewedUtterances(v: unknown): v is ReviewedUtterance[] {
  if (!Array.isArray(v) || v.length === 0) return false;
  for (const row of v) {
    if (typeof row !== "object" || row === null) return false;
    const o = row as Record<string, unknown>;
    if (
      typeof o.speaker !== "string" ||
      typeof o.text !== "string" ||
      typeof o.start !== "number" ||
      typeof o.end !== "number"
    ) {
      return false;
    }
  }
  return true;
}

function isSourceUtterances(v: unknown): v is SourceUtterance[] {
  if (!Array.isArray(v) || v.length === 0) return false;
  for (const row of v) {
    if (typeof row !== "object" || row === null) return false;
    const o = row as Record<string, unknown>;
    if (
      typeof o.speaker !== "string" ||
      typeof o.text !== "string" ||
      typeof o.start !== "number" ||
      typeof o.end !== "number"
    ) {
      return false;
    }
  }
  return true;
}

export default async function InterviewTranscriptReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: interview, error } = await supabase
    .from("interviews")
    .select(
      "id, title, project_id, source_type, source_metadata, audio_url, audio_storage_path, transcript_full, speaker_map, audio_duration, source_utterances, reviewed_utterances, transcript_review_status, last_intel_source, status"
    )
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
  // Non-members get 404 — same gate as the interview detail page.
  if (userRole === null) {
    notFound();
  }
  const canEdit = userRole === "owner" || userRole === "editor";

  const sourceType = interview.source_type as SourceType;
  const dbSpeakerMap = (interview.speaker_map as SpeakerMap) ?? {};

  let initialUtterances: ReviewedUtterance[] = [];
  let derivedSpeakerMap: SpeakerMap = {};
  let parseWarning: string | null = null;

  if (isStoredReviewedUtterances(interview.reviewed_utterances)) {
    initialUtterances = interview.reviewed_utterances;
  } else if (isSourceUtterances(interview.source_utterances)) {
    initialUtterances = sourceUtterancesToReviewedUtterances(interview.source_utterances);
  } else if (interview.transcript_full) {
    // Text + document sources have no AssemblyAI source_utterances. Use a
    // structure-aware parser that mirrors `chunkTextInterview` so the editor
    // shows the same logical units the chunker will see on reprocess.
    if (sourceType === "text" || sourceType === "document") {
      const result = parseTextInterviewToUtterances(
        interview.transcript_full,
        readStructureHint(interview.source_metadata)
      );
      initialUtterances = result.utterances;
      derivedSpeakerMap = result.speakerMap;
    } else {
      initialUtterances = parseTranscriptFullToUtterances(
        interview.transcript_full,
        dbSpeakerMap,
        interview.audio_duration
      );
    }

    if (initialUtterances.length === 0) {
      parseWarning =
        "Could not parse the stored transcript into editable segments. If this interview uses a non-standard format, paste fixes after re-uploading.";
    }
  }

  // Overlay parser-derived labels (Q/A/P/<speaker>) onto whatever the DB has
  // so the existing speakerMap-based UI keeps working without branching on
  // source_type. DB values win when both define the same code.
  const effectiveSpeakerMap: SpeakerMap = {
    ...derivedSpeakerMap,
    ...dbSpeakerMap,
  };

  const { data: seedRows } = await supabase
    .from("interview_review_entities")
    .select("id, display_name, entity_type, entity_id")
    .eq("interview_id", id)
    .order("created_at", { ascending: true });

  const seeds: ReviewSeedRow[] = (seedRows ?? []).map((r) => ({
    id: r.id,
    display_name: r.display_name,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
  }));

  // Fetch entities already extracted from this source by the pipeline.
  // Uses admin client (RLS on source_entities requires service role for this query path).
  // Deduplicate by entity_id — keep first occurrence per entity.
  const admin2 = createAdminClient();
  const { data: rawSourceEntities } = await admin2
    .from("source_entities")
    .select("entity_id, link_type, entities(id, name, type)")
    .eq("source_id", id)
    .order("created_at", { ascending: true });

  const seenEntityIds = new Set<string>();
  const extractedEntities: ExtractedEntity[] = [];
  for (const row of rawSourceEntities ?? []) {
    if (seenEntityIds.has(row.entity_id)) continue;
    seenEntityIds.add(row.entity_id);
    const entityData = Array.isArray(row.entities) ? row.entities[0] : row.entities;
    if (!entityData || typeof (entityData as { name?: string }).name !== "string") continue;
    const ed = entityData as { id: string; name: string; type: string };
    extractedEntities.push({
      entity_id: row.entity_id,
      link_type: (row.link_type as string | null) ?? null,
      entity: { id: ed.id, name: ed.name, type: ed.type },
    });
  }

  if (!canEdit) {
    return (
      <div className="p-6">
        <Link
          href={`/interviews/${id}`}
          className="mb-6 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to interview
        </Link>
        <h1 className="text-2xl font-bold">Transcript review</h1>
        <p className="mt-2 text-muted-foreground">
          Only editors and owners can correct transcripts and seed entities.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/interviews/${id}`}>Return to interview</Link>
        </Button>
      </div>
    );
  }

  return (
    <TranscriptReviewEditor
      interviewId={id}
      projectId={interview.project_id}
      interviewTitle={interview.title}
      speakerMap={effectiveSpeakerMap}
      initialUtterances={initialUtterances}
      reviewStatus={interview.transcript_review_status}
      sourceStatus={interview.status as InterviewStatus}
      lastIntelSource={interview.last_intel_source}
      seeds={seeds}
      extractedEntities={extractedEntities}
      parseWarning={parseWarning}
      sourceType={sourceType}
      audioUrl={audioPlaybackUrl}
    />
  );
}
