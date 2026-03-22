import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformUserListRow = {
  id: string;
  email: string | undefined;
  full_name: string | null;
  platform_roles: string[];
};

const PAGE_SIZE = 25;
const SEARCH_SCAN_CAP = 500;

async function enrichUsers(
  admin: ReturnType<typeof createAdminClient>,
  users: User[],
  ids: string[]
): Promise<PlatformUserListRow[]> {
  if (ids.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  const { data: roleRows } = await admin
    .from("user_platform_roles")
    .select("user_id, role")
    .in("user_id", ids);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name] as const)
  );
  const rolesByUser = new Map<string, string[]>();
  for (const row of roleRows ?? []) {
    const list = rolesByUser.get(row.user_id) ?? [];
    list.push(row.role);
    rolesByUser.set(row.user_id, list);
  }

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    full_name: profileMap.get(u.id) ?? null,
    platform_roles: (rolesByUser.get(u.id) ?? []).sort(),
  }));
}

/**
 * Lists auth users with profile + platform roles for Platform Administration.
 * Search scans up to SEARCH_SCAN_CAP users (MVP); unfiltered uses Auth pagination.
 */
export async function loadPlatformUsersList(args: {
  page: number;
  q: string;
}): Promise<{
  rows: PlatformUserListRow[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  /** Set when search is active; otherwise null (auth API has no total count). */
  totalPages: number | null;
  scanLimited: boolean;
}> {
  const admin = createAdminClient();
  const page = Math.max(1, args.page);
  const q = args.q.trim().toLowerCase();

  if (!q) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) {
      throw new Error(error.message);
    }
    const users = data.users;
    const ids = users.map((u) => u.id);
    const rows = await enrichUsers(admin, users, ids);
    return {
      rows,
      page,
      pageSize: PAGE_SIZE,
      hasNextPage: users.length === PAGE_SIZE,
      totalPages: null,
      scanLimited: false,
    };
  }

  const allUsers: User[] = [];
  let p = 1;
  while (allUsers.length < SEARCH_SCAN_CAP) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: p,
      perPage: 100,
    });
    if (error) {
      throw new Error(error.message);
    }
    if (data.users.length === 0) break;
    allUsers.push(...data.users);
    if (data.users.length < 100) break;
    p++;
  }

  const ids = allUsers.map((u) => u.id);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  const profileMap = new Map(
    (profiles ?? []).map((pr) => [pr.id, pr.full_name] as const)
  );

  const filtered = allUsers.filter((u) => {
    const email = (u.email ?? "").toLowerCase();
    const name = (profileMap.get(u.id) ?? "").toLowerCase();
    return email.includes(q) || name.includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  const sliceIds = slice.map((u) => u.id);
  const rows = await enrichUsers(admin, slice, sliceIds);

  return {
    rows,
    page: safePage,
    pageSize: PAGE_SIZE,
    hasNextPage: safePage < totalPages,
    totalPages,
    scanLimited: allUsers.length >= SEARCH_SCAN_CAP,
  };
}
