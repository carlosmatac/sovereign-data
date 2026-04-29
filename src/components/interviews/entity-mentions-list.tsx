"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Building2,
  Check,
  Loader2,
  MapPin,
  Pencil,
  User,
  X,
  Clock,
} from "lucide-react";
import { updateEntityName } from "@/app/actions/entities";

type MentionItem = {
  mentionId: string;
  entityId: string;
  name: string;
  type: string;
  description: string | null;
  sentiment: string | null;
};

type EntityMentionsListProps = {
  mentions: MentionItem[];
  projectId: string;
  canEdit: boolean;
};

const SdIcon = ({ className }: { className?: string }) => (
  <img src="/aksum_white.svg" alt="" className={className} aria-hidden />
);

const ENTITY_ICON_BY_TYPE: Record<string, React.ReactNode> = {
  PERSON: <User className="h-3.5 w-3.5" />,
  COMPANY: <Building2 className="h-3.5 w-3.5" />,
  GOVERNMENT: <SdIcon className="h-3.5 w-3.5" />,
  ORGANIZATION: <SdIcon className="h-3.5 w-3.5" />,
  LOCATION: <MapPin className="h-3.5 w-3.5" />,
  EVENT: <Clock className="h-3.5 w-3.5" />,
  COUNTRY: <MapPin className="h-3.5 w-3.5" />,
  SECTOR: <Building2 className="h-3.5 w-3.5" />,
  COMMODITY: <Building2 className="h-3.5 w-3.5" />,
  PUBLIC_INSTITUTION: <SdIcon className="h-3.5 w-3.5" />,
  STATE_OWNED_ENTERPRISE: <Building2 className="h-3.5 w-3.5" />,
  LAW_OR_POLICY: <Clock className="h-3.5 w-3.5" />,
  MEDIA_OR_PUBLICATION: <SdIcon className="h-3.5 w-3.5" />,
};

export function EntityMentionsList({
  mentions,
  projectId,
  canEdit,
}: EntityMentionsListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingMentionId, setEditingMentionId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const startEditing = (mentionId: string, currentName: string) => {
    setEditingMentionId(mentionId);
    setDraftName(currentName);
  };

  const cancelEditing = () => {
    setEditingMentionId(null);
    setDraftName("");
  };

  const saveEdit = (entityId: string) => {
    if (!draftName.trim()) {
      toast.error("Entity name cannot be empty");
      return;
    }

    startTransition(async () => {
      const result = await updateEntityName(entityId, draftName, projectId);

      if (result.error) {
        toast.error("Failed to update entity", { description: result.error });
        return;
      }

      toast.success(
        result.merged
          ? "Entity merged and correction learned"
          : "Entity renamed and correction learned"
      );

      cancelEditing();
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {mentions.map((mention) => {
        const isEditing = editingMentionId === mention.mentionId;

        return (
          <div
            key={mention.mentionId}
            className="flex items-start gap-2 rounded-md p-2 hover:bg-muted"
          >
            <div className="mt-0.5 text-muted-foreground">
              {ENTITY_ICON_BY_TYPE[mention.type] ?? (
                <SdIcon className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit(mention.entityId);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEditing();
                      }
                    }}
                    autoFocus
                    className="h-8"
                    disabled={isPending}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => saveEdit(mention.entityId)}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={cancelEditing}
                    disabled={isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium">{mention.name}</p>
                  {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => startEditing(mention.mentionId, mention.name)}
                      disabled={isPending}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}

              {mention.description && (
                <p className="text-xs text-muted-foreground">
                  {mention.description}
                </p>
              )}
              <div className="mt-0.5 flex items-center gap-2">
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {mention.type}
                </Badge>
                {mention.sentiment && (
                  <span
                    className={`text-[10px] ${
                      mention.sentiment === "positive"
                        ? "text-green-600"
                        : mention.sentiment === "negative"
                          ? "text-red-600"
                          : "text-gray-500"
                    }`}
                  >
                    {mention.sentiment}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
