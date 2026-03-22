"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { PlatformUserListRow } from "@/lib/admin/load-platform-users";
import {
  grantPlatformRole,
  revokePlatformRole,
} from "@/app/actions/platform-role-management";

interface PlatformUsersTableProps {
  rows: PlatformUserListRow[];
  currentUserId: string;
  soleSuperuserId: string | null;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  totalPages: number | null;
  initialQ: string;
  scanLimited: boolean;
}

const ROLE_ORDER = ["member", "platform_admin", "superuser"] as const;

function sortRolesForDisplay(roles: string[]) {
  return [...roles].sort(
    (a, b) =>
      ROLE_ORDER.indexOf(a as (typeof ROLE_ORDER)[number]) -
      ROLE_ORDER.indexOf(b as (typeof ROLE_ORDER)[number])
  );
}

function buildHref(p: number, q: string) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (p > 1) params.set("page", String(p));
  const s = params.toString();
  return s ? `/admin/users?${s}` : "/admin/users";
}

export function PlatformUsersTable({
  rows,
  currentUserId,
  soleSuperuserId,
  page,
  pageSize,
  hasNextPage,
  totalPages,
  initialQ,
  scanLimited,
}: PlatformUsersTableProps) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(initialQ);
  const [pending, setPending] = useState<{
    userId: string;
    op: string;
  } | null>(null);

  const runMutation = async (
    userId: string,
    op: string,
    action: () => Promise<{ error?: string; success?: true }>,
    okMessage: string
  ) => {
    setPending({ userId, op });
    try {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(okMessage);
      router.refresh();
    } finally {
      setPending(null);
    }
  };

  const rowLocked = pending !== null;
  const spin = (userId: string, op: string) =>
    pending?.userId === userId && pending?.op === op;

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(buildHref(1, searchInput));
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={onSearchSubmit}
        className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            placeholder="Search by email or name…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            disabled={rowLocked}
          />
        </div>
        <Button type="submit" disabled={rowLocked}>
          Search
        </Button>
      </form>

      {scanLimited ? (
        <p className="text-amber-600/90 text-xs dark:text-amber-400/90">
          Search scanned the first 500 accounts only. Refine the query or use
          Supabase for larger directories.
        </p>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Platform roles</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No users match this page or search.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const sorted = sortRolesForDisplay(row.platform_roles);
                const hasSuper = row.platform_roles.includes("superuser");
                const hasEntityAdmin =
                  row.platform_roles.includes("platform_admin");
                const revokeSuperLocked =
                  soleSuperuserId !== null && row.id === soleSuperuserId;

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      {row.email ?? "—"}
                      {row.id === currentUserId ? (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          You
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.full_name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {sorted.map((r) => (
                          <Badge
                            key={r}
                            variant={
                              r === "superuser"
                                ? "default"
                                : r === "platform_admin"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="text-[10px] font-normal"
                          >
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end">
                        {!hasEntityAdmin ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={rowLocked}
                            onClick={() =>
                              runMutation(
                                row.id,
                                "grant-pa",
                                () =>
                                  grantPlatformRole(row.id, "platform_admin"),
                                "Entity governance role granted"
                              )
                            }
                          >
                            {spin(row.id, "grant-pa") ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              "+ Entity admin"
                            )}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={rowLocked}
                            onClick={() =>
                              runMutation(
                                row.id,
                                "revoke-pa",
                                () =>
                                  revokePlatformRole(row.id, "platform_admin"),
                                "Entity admin revoked"
                              )
                            }
                          >
                            {spin(row.id, "revoke-pa") ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              "− Entity admin"
                            )}
                          </Button>
                        )}
                        {!hasSuper ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={rowLocked}
                            onClick={() =>
                              runMutation(
                                row.id,
                                "grant-su",
                                () => grantPlatformRole(row.id, "superuser"),
                                "Superuser granted"
                              )
                            }
                          >
                            {spin(row.id, "grant-su") ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              "+ Superuser"
                            )}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={rowLocked || revokeSuperLocked}
                            title={
                              revokeSuperLocked
                                ? "Cannot remove the last superuser"
                                : undefined
                            }
                            onClick={() =>
                              runMutation(
                                row.id,
                                "revoke-su",
                                () =>
                                  revokePlatformRole(row.id, "superuser"),
                                "Superuser revoked"
                              )
                            }
                          >
                            {spin(row.id, "revoke-su") ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              "− Superuser"
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Page {page}
          {totalPages !== null ? ` of ${totalPages}` : null}
          {initialQ.trim() ? "" : ` · ${pageSize} per page`}
        </span>
        <div className="flex gap-2">
          {page <= 1 ? (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref(page - 1, initialQ)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Link>
            </Button>
          )}
          {!hasNextPage ? (
            <Button variant="outline" size="sm" disabled>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref(page + 1, initialQ)}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
