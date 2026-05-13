"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Trash2, Link2, ExternalLink } from "lucide-react";

export interface ProjectEntityLink {
  id: string;
  project_id: string;
  project_name: string;
  note: string | null;
  created_at: string;
}

export interface AvailableProject {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
}

interface Props {
  entityId: string;
  initialLinks: ProjectEntityLink[];
  availableProjects: AvailableProject[];
}

export function EntityProjectLinksPanel({
  entityId,
  initialLinks,
  availableProjects,
}: Props) {
  const router = useRouter();
  const [links, setLinks] = useState<ProjectEntityLink[]>(initialLinks);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const editableProjects = availableProjects.filter(
    (p) => p.role === "owner" || p.role === "editor"
  );

  const alreadyLinkedIds = new Set(links.map((l) => l.project_id));
  const linkableProjects = editableProjects.filter(
    (p) => !alreadyLinkedIds.has(p.id)
  );

  const handleLink = () => {
    if (!selectedProjectId) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(selectedProjectId)}/linked-entities`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_id: entityId,
            note: note.trim() || null,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to link entity");
        return;
      }

      toast.success("Entity linked to project");
      setSelectedProjectId("");
      setNote("");
      router.refresh();
    });
  };

  const handleUnlink = (projectId: string, linkId: string) => {
    setDeletingId(linkId);
    startTransition(async () => {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/linked-entities/${encodeURIComponent(entityId)}`,
        { method: "DELETE" }
      );
      setDeletingId(null);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to unlink entity");
        return;
      }

      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      toast.success("Entity unlinked from project");
    });
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Project links
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Explicitly associate this entity with one or more projects,
          independent of source mentions.
        </p>
      </div>

      {/* Existing links */}
      {links.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
          No direct project links yet.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-lg border">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                  <Link
                    href={`/projects/${link.project_id}`}
                    className="truncate text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {link.project_name}
                  </Link>
                  <ExternalLink className="text-muted-foreground h-3 w-3 shrink-0" />
                </div>
                {link.note ? (
                  <p className="text-muted-foreground mt-1 text-xs leading-snug">
                    {link.note}
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Linked{" "}
                  {new Date(link.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0"
                disabled={deletingId === link.id || isPending}
                onClick={() => handleUnlink(link.project_id, link.id)}
                aria-label={`Unlink from ${link.project_name}`}
              >
                {deletingId === link.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Link to a new project */}
      {linkableProjects.length > 0 ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Link to a project</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a project…" />
                </SelectTrigger>
                <SelectContent>
                  {linkableProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        {p.name}
                        {p.role === "owner" && (
                          <Badge
                            variant="outline"
                            className="py-0 px-1 text-[10px]"
                          >
                            owner
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Optional note — why is this entity relevant to the project?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
            <Button
              onClick={handleLink}
              disabled={!selectedProjectId || isPending}
              className="self-start sm:self-end"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Link
            </Button>
          </div>
        </div>
      ) : editableProjects.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          This entity is already linked to all projects you can edit.
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          You need editor or owner access on a project to create direct links.
        </p>
      )}
    </section>
  );
}
