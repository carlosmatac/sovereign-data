"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Pencil, Search } from "lucide-react";
import type { GovernanceEntityListRow } from "@/lib/admin/load-governance-entities";
import type { EntityType } from "@/types/database";

const ENTITY_TYPES: EntityType[] = [
  "PERSON",
  "COMPANY",
  "GOVERNMENT",
  "ORGANIZATION",
  "LOCATION",
  "EVENT",
];

type ProjectOption = { id: string; name: string };

function buildListHref(args: {
  page: number;
  q: string;
  typeFilter: string;
  scope: string;
  projectId: string;
}) {
  const p = new URLSearchParams();
  if (args.q.trim()) p.set("q", args.q.trim());
  if (args.typeFilter && args.typeFilter !== "all") p.set("type", args.typeFilter);
  if (args.scope && args.scope !== "all") p.set("scope", args.scope);
  if (args.scope === "project" && args.projectId) p.set("project_id", args.projectId);
  if (args.page > 1) p.set("page", String(args.page));
  const s = p.toString();
  return s ? `/admin/entities?${s}` : "/admin/entities";
}

interface Props {
  rows: GovernanceEntityListRow[];
  projects: ProjectOption[];
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  initialQ: string;
  initialType: string;
  initialScope: string;
  initialProjectId: string;
}

export function GovernanceEntitiesTable({
  rows,
  projects,
  page,
  totalPages,
  totalCount,
  pageSize,
  initialQ,
  initialType,
  initialScope,
  initialProjectId,
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [typeFilter, setTypeFilter] = useState(initialType || "all");
  const [scope, setScope] = useState(initialScope || "all");
  const [projectId, setProjectId] = useState(initialProjectId);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(
      buildListHref({
        page: 1,
        q,
        typeFilter,
        scope,
        projectId,
      })
    );
  };

  const typeBadgeVariant = (t: EntityType) => {
    switch (t) {
      case "PERSON":
        return "default";
      case "COMPANY":
        return "secondary";
      default:
        return "outline";
    }
  };

  const detailHref = (entityId: string) => `/admin/entities/${entityId}`;

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        {/** Flex + items-end: control baselines align; invisible label matches real label height above the button. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-4 lg:gap-y-4">
          <div className="min-w-0 flex-1 lg:min-w-[220px] lg:max-w-xl">
            <label
              htmlFor="governance-search"
              className="text-muted-foreground mb-2 block text-xs font-medium leading-none"
            >
              Search
            </label>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                id="governance-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Canonical or normalized name…"
                className="h-9 pl-9 text-sm leading-none"
                name="q"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="w-full sm:max-w-[200px] lg:w-44 lg:max-w-none lg:shrink-0">
            <label className="text-muted-foreground mb-2 block text-xs font-medium leading-none">
              Type
            </label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-full text-sm">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:max-w-[200px] lg:w-44 lg:max-w-none lg:shrink-0">
            <label className="text-muted-foreground mb-2 block text-xs font-medium leading-none">
              Scope
            </label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="h-9 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scopes</SelectItem>
                <SelectItem value="global">Global only</SelectItem>
                <SelectItem value="project">Single project</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "project" ? (
            <div className="min-w-0 w-full lg:min-w-[200px] lg:max-w-xs lg:flex-1">
              <label className="text-muted-foreground mb-2 block text-xs font-medium leading-none">
                Project
              </label>
              {projects.length === 0 ? (
                <p className="text-muted-foreground flex h-9 items-center rounded-md border border-dashed px-3 text-sm">
                  No projects in this deployment.
                </p>
              ) : (
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((pr) => (
                      <SelectItem key={pr.id} value={pr.id}>
                        {pr.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : null}

          <div className="w-full lg:ml-auto lg:w-auto lg:shrink-0">
            <label
              className="text-muted-foreground mb-2 block text-xs font-medium leading-none invisible"
              aria-hidden
            >
              Apply
            </label>
            <Button
              type="submit"
              className="h-9 w-full px-4 text-sm lg:w-auto"
            >
              Apply filters
            </Button>
          </div>
        </div>
      </form>

      <div className="text-muted-foreground flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span>
          {totalCount === 0
            ? "No canonical entities match these filters."
            : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}
        </span>
        <span className="text-xs sm:text-sm">
          Open a row to review and edit on the detail page.
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[min(28%,320px)]">Entity</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead className="text-right">Aliases</TableHead>
              <TableHead className="text-right">Mentions</TableHead>
              <TableHead className="text-right">Updated</TableHead>
              <TableHead className="text-right w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-14 text-center text-sm"
                >
                  No rows on this page. Adjust filters or search.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="group">
                  <TableCell>
                    <Link
                      href={detailHref(row.id)}
                      className="text-primary font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                      {row.normalized_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={typeBadgeVariant(row.type)}
                      className="text-xs font-normal"
                    >
                      {row.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {row.project_id === null ? (
                      <span className="text-amber-700 text-xs font-medium dark:text-amber-400/90">
                        Global
                      </span>
                    ) : (
                      <span className="truncate text-sm">
                        {row.project_name ?? `${row.project_id.slice(0, 8)}…`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.alias_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.mention_count}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap">
                    {new Date(row.updated_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="h-8" asChild>
                      <Link href={detailHref(row.id)}>
                        <Pencil className="mr-1.5 size-3.5 opacity-70" />
                        Edit
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={buildListHref({
                  page: page - 1,
                  q: initialQ,
                  typeFilter: initialType || "all",
                  scope: initialScope || "all",
                  projectId: initialProjectId,
                })}
              >
                <ChevronLeft className="mr-1 size-4" />
                Previous
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="mr-1 size-4" />
              Previous
            </Button>
          )}
          <span className="text-muted-foreground px-2 text-sm">
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={buildListHref({
                  page: page + 1,
                  q: initialQ,
                  typeFilter: initialType || "all",
                  scope: initialScope || "all",
                  projectId: initialProjectId,
                })}
              >
                Next
                <ChevronRight className="ml-1 size-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Next
              <ChevronRight className="ml-1 size-4" />
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
