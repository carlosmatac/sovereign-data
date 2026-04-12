"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateInterviewTitle } from "@/app/actions/interview-title";

type Props = {
  interviewId: string;
  initialTitle: string;
  canEdit: boolean;
};

export function EditableInterviewTitle({
  interviewId,
  initialTitle,
  canEdit,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraft(initialTitle);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const cancel = () => {
    setIsEditing(false);
    setDraft(initialTitle);
  };

  const save = () => {
    if (draft.trim() === initialTitle.trim()) {
      setIsEditing(false);
      return;
    }

    startTransition(async () => {
      const result = await updateInterviewTitle(interviewId, draft);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Interview renamed");
      setIsEditing(false);
      router.refresh();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isPending}
          className="h-9 text-2xl font-bold tracking-tight border-primary/50 focus-visible:ring-primary/30 w-full max-w-xl"
          autoFocus
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={save}
          disabled={isPending || !draft.trim()}
          aria-label="Save title"
          className="shrink-0"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4 text-emerald-500" />
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={cancel}
          disabled={isPending}
          aria-label="Cancel"
          className="shrink-0"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2">
      <h1 className="text-3xl font-bold tracking-tight">{initialTitle}</h1>
      {canEdit && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={startEditing}
          aria-label="Edit interview title"
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-8 w-8"
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}
