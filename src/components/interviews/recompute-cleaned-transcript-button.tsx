"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, RefreshCcw } from "lucide-react";
import { recomputeCleanedTranscript } from "@/app/(dashboard)/interviews/[id]/actions";

type RecomputeCleanedTranscriptButtonProps = {
  interviewId: string;
};

export function RecomputeCleanedTranscriptButton({
  interviewId,
}: RecomputeCleanedTranscriptButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleRecompute = () => {
    startTransition(async () => {
      const result = await recomputeCleanedTranscript(interviewId);
      if (result.error) {
        toast.error("Failed to recompute cleaned transcript", {
          description: result.error,
        });
        return;
      }

      toast.success("Cleaned transcript recomputed", {
        description:
          typeof result.replacementsApplied === "number"
            ? `${result.replacementsApplied} replacements applied`
            : undefined,
      });
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleRecompute}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCcw className="mr-2 h-3.5 w-3.5" />
      )}
      Recompute cleaned transcript
    </Button>
  );
}
