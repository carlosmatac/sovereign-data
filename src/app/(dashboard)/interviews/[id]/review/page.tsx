import { createClient } from "@/lib/supabase/server";
import { getUserProjectRole } from "@/lib/auth/project-role";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TranscriptReviewEditor,
  type ReviewSeedRow,
} from "@/components/interviews/transcript-review-editor";
import { parseTranscriptFullToUtterances } from "@/lib/interviews/transcript-utterances-from-full";
import { InterviewStatusTracker } from "@/components/interviews/status-tracker";
import type {
  InterviewStatus,
  ReviewedUtterance,
  SourceType,
  SpeakerMap,
} from "@/types/database";

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
      "id, title, project_id, status, error_message, source_type, transcript_full, speaker_map, audio_duration, reviewed_utterances, transcript_review_status, last_intel_source"
    )
    .eq("id", id)
    .single();

  if (error || !interview) {
    notFound();
  }

  const userRole = await getUserProjectRole(interview.project_id);
  const canEdit = userRole === "owner" || userRole === "editor";

  let initialUtterances: ReviewedUtterance[] = [];
  let parseWarning: string | null = null;

  if (isStoredReviewedUtterances(interview.reviewed_utterances)) {
    initialUtterances = interview.reviewed_utterances;
  } else if (interview.transcript_full) {
    const speakerMap = (interview.speaker_map as SpeakerMap) ?? {};
    initialUtterances = parseTranscriptFullToUtterances(
      interview.transcript_full,
      speakerMap,
      interview.audio_duration
    );
    if (initialUtterances.length === 0) {
      parseWarning =
        "Could not parse speaker-labelled blocks from the stored transcript. If this interview uses a non-standard format, use a completed audio interview or paste fixes after a future import.";
    }
  }

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
    <div className="space-y-6">
      <div className="px-6 pt-6">
        <InterviewStatusTracker
          interviewId={id}
          currentStatus={interview.status as InterviewStatus}
          errorMessage={interview.error_message}
          sourceType={interview.source_type as SourceType}
        />
      </div>
      <TranscriptReviewEditor
        interviewId={id}
        projectId={interview.project_id}
        interviewTitle={interview.title}
        speakerMap={(interview.speaker_map as SpeakerMap) ?? {}}
        initialUtterances={initialUtterances}
        reviewStatus={interview.transcript_review_status}
        lastIntelSource={interview.last_intel_source}
        seeds={seeds}
        parseWarning={parseWarning}
      />
    </div>
  );
}
