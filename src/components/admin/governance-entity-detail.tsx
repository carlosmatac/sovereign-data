"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { GovernanceEntityDetail } from "@/lib/admin/load-governance-entities";
import { GOVERNANCE_ALIAS_PREVIEW_LIMIT } from "@/lib/admin/load-governance-entities";
import type {
  GovernanceRelationshipDirectionFilter,
  GovernanceRelationshipRow,
  GovernanceRelationshipStatusFilter,
} from "@/lib/admin/load-governance-relationships";
import { GovernanceRelationshipsSection } from "@/components/admin/governance-relationships-section";
import {
  EntityProjectLinksPanel,
  type ProjectEntityLink,
  type AvailableProject,
} from "@/components/admin/entity-project-links-panel";
import { ENTITY_TYPE_VALUES, type EntityType } from "@/types/database";
import { updateGovernedEntity } from "@/app/actions/admin-entity-governance";

interface Props {
  entity: GovernanceEntityDetail;
  isSuperuser: boolean;
  relationships: {
    rows: GovernanceRelationshipRow[];
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    statusFilter: GovernanceRelationshipStatusFilter;
    directionFilter: GovernanceRelationshipDirectionFilter;
  };
  projectLinks: ProjectEntityLink[];
  availableProjects: AvailableProject[];
}

export function GovernanceEntityDetailPanel({
  entity,
  isSuperuser,
  relationships,
  projectLinks,
  availableProjects,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(entity.name);
  const [description, setDescription] = useState(entity.description ?? "");
  const [type, setType] = useState<EntityType>(entity.type);

  const isRedirect = entity.canonical_entity_id !== null;
  const canonicalHref = entity.canonical_target
    ? `/admin/entities/${entity.canonical_target.id}`
    : null;

  const saveCore = () => {
    startTransition(async () => {
      const res = await updateGovernedEntity(entity.id, {
        name,
        description: description.trim() === "" ? null : description.trim(),
        type,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Entity saved");
      router.refresh();
    });
  };

  const aliasPreviewNote =
    entity.alias_count > entity.aliases_preview.length
      ? `Showing ${entity.aliases_preview.length} of ${entity.alias_count} aliases.`
      : null;

  return (
    <div className="space-y-10">
      {isRedirect ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-4 text-sm">
          <p className="font-medium text-amber-950 dark:text-amber-100">
            Merged / redirect record
          </p>
          <p className="text-muted-foreground mt-1">
            This row points at another canonical entity. Edits are disabled
            here — open the canonical record to make changes.
          </p>
          {canonicalHref ? (
            <Button className="mt-3" asChild>
              <Link href={canonicalHref}>
                Open canonical: {entity.canonical_target?.name ?? "entity"}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Overview — read-only context */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Record overview</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            System identifiers and graph footprint (read-only).
          </p>
        </div>
        <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Entity ID
            </p>
            <p className="mt-1 font-mono text-xs break-all">{entity.id}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Normalized name
            </p>
            <p className="mt-1 font-mono text-sm">{entity.normalized_name}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Last updated
            </p>
            <p className="mt-1 text-sm">
              {new Date(entity.updated_at).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Scope
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {entity.project_id === null ? (
                <Badge className="bg-amber-600/90 text-xs hover:bg-amber-600/90 dark:bg-amber-700/90">
                  Global
                </Badge>
              ) : (
                <>
                  <Badge variant="secondary" className="text-xs">
                    Project
                  </Badge>
                  <span className="text-sm">
                    {entity.project_name ?? entity.project_id}
                  </span>
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Aliases
            </p>
            <p className="mt-1 text-sm tabular-nums">{entity.alias_count}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Mentions
            </p>
            <p className="mt-1 text-sm tabular-nums">{entity.mention_count}</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Relationships (graph edges)
            </p>
            <p className="mt-1 text-sm">
              <span className="tabular-nums font-medium">
                {entity.relationship_count}
              </span>{" "}
              <span className="text-muted-foreground">
                rows in{" "}
                <code className="text-xs">entity_relationships</code> where this
                entity is source or target.
              </span>
            </p>
          </div>
        </div>
      </section>

      <Separator />

      {/* Editable MVP fields */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Edit canonical fields
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Changes apply to the knowledge base (search, graph, reports).
            Transcript wording is not rewritten automatically.
          </p>
        </div>
        <div className="grid max-w-xl gap-5 rounded-lg border bg-card p-5">
          <div className="space-y-2">
            <Label htmlFor="gov-name">Canonical name</Label>
            <Input
              id="gov-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isRedirect || pending}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gov-type">Entity type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as EntityType)}
              disabled={isRedirect || pending}
            >
              <SelectTrigger id="gov-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPE_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gov-desc">Description</Label>
            <Textarea
              id="gov-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              disabled={isRedirect || pending}
              placeholder="Optional context for analysts and retrieval…"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={saveCore}
              disabled={isRedirect || pending}
              size="default"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
            <Button variant="outline" type="button" asChild disabled={pending}>
              <Link href="/admin/entities">Cancel / back to list</Link>
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      {/* Aliases — read-only preview (MVP) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Known aliases
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Read-only preview. Alias management from this screen can ship in a
            later iteration; interview Entity Editor can still learn aliases
            where you have project editor access.
          </p>
          {aliasPreviewNote ? (
            <p className="text-muted-foreground mt-2 text-xs">{aliasPreviewNote}</p>
          ) : null}
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Alias</TableHead>
                <TableHead>Normalized</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entity.aliases_preview.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-muted-foreground py-10 text-center text-sm"
                  >
                    No aliases stored for this entity.
                  </TableCell>
                </TableRow>
              ) : (
                entity.aliases_preview.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.alias}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {a.alias_normalized}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {a.source ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {entity.alias_count > GOVERNANCE_ALIAS_PREVIEW_LIMIT ? (
          <p className="text-muted-foreground text-xs">
            List capped at {GOVERNANCE_ALIAS_PREVIEW_LIMIT} rows for performance.
          </p>
        ) : null}
      </section>

      <Separator />

      <EntityProjectLinksPanel
        entityId={entity.id}
        initialLinks={projectLinks}
        availableProjects={availableProjects}
      />

      <Separator />

      <GovernanceRelationshipsSection
        entityId={entity.id}
        rows={relationships.rows}
        page={relationships.page}
        pageSize={relationships.pageSize}
        totalCount={relationships.totalCount}
        totalPages={relationships.totalPages}
        statusFilter={relationships.statusFilter}
        directionFilter={relationships.directionFilter}
      />

      <div className="text-muted-foreground flex flex-wrap gap-3 border-t pt-6 text-xs">
        {isSuperuser ? (
          <Link
            href="/admin"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Platform Administration
          </Link>
        ) : null}
        <Link
          href="/admin/entities"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          All entities
        </Link>
      </div>
    </div>
  );
}
