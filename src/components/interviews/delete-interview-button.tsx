"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface DeleteInterviewButtonProps {
  interviewId: string;
  interviewTitle: string;
  redirectTo?: string;
  variant?: "icon" | "full";
}

export function DeleteInterviewButton({
  interviewId,
  interviewTitle,
  redirectTo = "/interviews",
  variant = "full",
}: DeleteInterviewButtonProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete");
      }

      toast.success("Interview deleted");
      setOpen(false);
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete interview"
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={(e) => e.preventDefault()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive hover:text-destructive-foreground">
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Interview</DialogTitle>
          <DialogDescription>
            This will permanently delete &ldquo;{interviewTitle}&rdquo; and all
            associated data including transcripts, extracted entities,
            relationships, marketing snippets, and the audio file. This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
