"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { InterviewStatus } from "@/types/database";

const PIPELINE_STEPS: Array<{
  status: InterviewStatus;
  label: string;
  description: string;
}> = [
  {
    status: "UPLOADING",
    label: "Upload",
    description: "Transferring audio to secure storage",
  },
  {
    status: "PROCESSING",
    label: "Queued",
    description: "Waiting for processing slot",
  },
  {
    status: "TRANSCRIBING",
    label: "Transcription",
    description: "Speaker diarization with AssemblyAI Universal-2",
  },
  {
    status: "EXTRACTING",
    label: "Intelligence Extraction",
    description: "Extracting entities, risks & opportunities via GPT-4o-mini",
  },
  {
    status: "EMBEDDING",
    label: "Indexing",
    description: "Generating semantic embeddings for search",
  },
  {
    status: "COMPLETED",
    label: "Ready",
    description: "Interview fully processed and searchable",
  },
];

interface StatusTrackerProps {
  interviewId: string;
  currentStatus: InterviewStatus;
  errorMessage?: string | null;
}

export function InterviewStatusTracker({
  interviewId,
  currentStatus: initialStatus,
  errorMessage: initialError,
}: StatusTrackerProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] =
    useState<InterviewStatus>(initialStatus);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError ?? null
  );

  // Subscribe to real-time status updates
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`interview-${interviewId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "interviews",
          filter: `id=eq.${interviewId}`,
        },
        (payload) => {
          const newStatus = payload.new.status as InterviewStatus;
          setCurrentStatus(newStatus);

          if (payload.new.error_message) {
            setErrorMessage(payload.new.error_message as string);
          }

          // Refresh the page when completed to show full content
          if (newStatus === "COMPLETED") {
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [interviewId, router]);

  const currentStepIndex = PIPELINE_STEPS.findIndex(
    (s) => s.status === currentStatus
  );
  const isFailed = currentStatus === "FAILED";

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {isFailed ? (
            <XCircle className="h-5 w-5 text-destructive" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
          {isFailed ? "Processing Failed" : "Processing Pipeline"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isFailed && errorMessage && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {errorMessage}
          </div>
        )}

        <div className="space-y-3">
          {PIPELINE_STEPS.filter((s) => s.status !== "COMPLETED").map(
            (step, index) => {
              const isComplete = !isFailed && currentStepIndex > index;
              const isCurrent = !isFailed && currentStepIndex === index;
              const isPending = !isFailed && currentStepIndex < index;

              return (
                <div key={step.status} className="flex items-center gap-3">
                  {/* Step indicator */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : isCurrent ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : isFailed ? (
                      <div className="h-2.5 w-2.5 rounded-full bg-destructive/30" />
                    ) : (
                      <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
                    )}
                  </div>

                  {/* Step text */}
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        isPending || isFailed
                          ? "text-muted-foreground"
                          : ""
                      }`}
                    >
                      {step.label}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      </CardContent>
    </Card>
  );
}
