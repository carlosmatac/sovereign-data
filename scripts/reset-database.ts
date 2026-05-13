/**
 * Reset Database — Wipe all project data and storage.
 *
 * Preserves: schema, extensions, RLS policies, functions, auth users, profiles,
 *            platform roles, and tenants.
 * Deletes:   all projects, sources (was "interviews"), chunks, entities, aliases,
 *            source_entities, project_entities, reports, snippets, chats, and
 *            audio storage files.
 *
 * Usage:  npx tsx scripts/reset-database.ts
 *
 * Updated 2026-05-13:
 *   - Renamed interviews → sources, interview_chunks → source_chunks
 *   - Added source_entities (migration 00028)
 *   - Added project_entities (migration 00043)
 *   - Updated storage bucket to source-audio-private (+ legacy interview-audio)
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type StorageEntry = {
  name: string;
  id?: string | null;
};

/**
 * Tables to wipe, in dependency order (most-dependent first so FK constraints
 * are never violated when using row-level deletes as fallback).
 */
const DATA_TABLES: Array<{ name: string; nonNullColumn: string }> = [
  // Chat layer
  { name: "chat_messages",           nonNullColumn: "id" },
  { name: "chat_conversation_seq",   nonNullColumn: "conversation_id" },
  { name: "chat_conversations",      nonNullColumn: "id" },
  // Reports
  { name: "reports",                 nonNullColumn: "id" },
  // Source-derived data
  { name: "content_snippets",        nonNullColumn: "id" },
  { name: "entity_relationships",    nonNullColumn: "id" },
  { name: "entity_mentions",         nonNullColumn: "id" },
  { name: "interview_review_entities", nonNullColumn: "id" },
  { name: "source_entities",         nonNullColumn: "id" },   // added 00028
  { name: "project_entities",        nonNullColumn: "id" },   // added 00043
  { name: "source_chunks",           nonNullColumn: "id" },   // renamed from interview_chunks
  // Entity graph
  { name: "validated_positions",     nonNullColumn: "id" },
  { name: "entity_aliases",          nonNullColumn: "id" },
  // Top-level project data
  { name: "sources",                 nonNullColumn: "id" },   // renamed from interviews
  { name: "entities",                nonNullColumn: "id" },   // canonical_entity_id cleared first
  { name: "project_members",         nonNullColumn: "id" },
  { name: "projects",                nonNullColumn: "id" },
];

// Storage buckets to wipe
const STORAGE_BUCKETS = [
  "source-audio-private",  // current bucket (migration: be888f4)
  "interview-audio",       // legacy bucket (pre-rename)
];

function joinStoragePath(prefix: string, name: string) {
  return prefix ? `${prefix}/${name}` : name;
}

async function listStorageFiles(bucket: string, prefix = ""): Promise<string[]> {
  const limit = 1000;
  let offset = 0;
  const paths: string[] = [];

  while (true) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit, offset });

    if (error) {
      // Bucket may not exist — treat as empty
      if (error.message?.includes("not found") || error.message?.includes("does not exist")) {
        return [];
      }
      throw new Error(`Could not list "${bucket}/${prefix || "/"}": ${error.message}`);
    }

    const entries = (data ?? []) as StorageEntry[];

    for (const entry of entries) {
      const path = joinStoragePath(prefix, entry.name);
      if (entry.id) {
        paths.push(path);
      } else {
        paths.push(...(await listStorageFiles(bucket, path)));
      }
    }

    if (entries.length < limit) break;
    offset += limit;
  }

  return paths;
}

async function clearStorageBucket(bucket: string) {
  process.stdout.write(`  Clearing bucket "${bucket}" ... `);

  let paths: string[];
  try {
    paths = await listStorageFiles(bucket);
  } catch (err) {
    console.log(`skipped (${(err as Error).message})`);
    return;
  }

  if (paths.length === 0) {
    console.log("already empty.");
    return;
  }

  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) {
      throw new Error(`Could not remove files from "${bucket}": ${error.message}`);
    }
  }

  console.log(`removed ${paths.length} file(s).`);
}

async function clearStorage() {
  console.log("\n🗑️  Clearing storage buckets ...");
  for (const bucket of STORAGE_BUCKETS) {
    await clearStorageBucket(bucket);
  }
}

async function deleteInOrder() {
  // Clear the self-referential FK on entities before deleting them.
  const { error: canonicalErr } = await admin
    .from("entities")
    .update({ canonical_entity_id: null })
    .not("canonical_entity_id", "is", null);

  if (canonicalErr) {
    throw new Error(`entities canonical_entity_id reset failed: ${canonicalErr.message}`);
  }

  for (const table of DATA_TABLES) {
    const { count, error } = await admin
      .from(table.name)
      .delete({ count: "exact" })
      .not(table.nonNullColumn, "is", null);

    if (error) {
      throw new Error(`${table.name}: ${error.message}`);
    }

    const suffix = count === null ? "" : ` (${count} row(s))`;
    console.log(`  ✓ ${table.name}${suffix}`);
  }
}

async function truncateTables() {
  console.log("\n🧹 Wiping all data tables ...");

  // Prefer TRUNCATE via exec_sql RPC for speed; fall back to per-row deletes
  // if the RPC is not installed.
  const { error } = await admin.rpc("exec_sql" as never, {
    query: `
      -- Clear self-referential FK first
      UPDATE entities SET canonical_entity_id = NULL WHERE canonical_entity_id IS NOT NULL;

      TRUNCATE TABLE
        chat_messages,
        chat_conversation_seq,
        chat_conversations,
        reports,
        content_snippets,
        entity_relationships,
        entity_mentions,
        interview_review_entities,
        source_entities,
        project_entities,
        source_chunks,
        validated_positions,
        entity_aliases,
        sources,
        entities,
        project_members,
        projects
      CASCADE;
    `,
  } as never);

  if (error) {
    console.log("  ℹ️  exec_sql RPC not available — using row-level deletes ...");
    await deleteInOrder();
  } else {
    console.log("  ✓ All tables truncated.");
  }
}

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("   SOVEREIGN DATA — DATABASE RESET");
  console.log("═══════════════════════════════════════════");
  console.log(`\nTarget: ${supabaseUrl}`);
  console.log(
    "This will DELETE all projects, sources, entities, graph data, reports,\n" +
    "chats, and audio files.\n" +
    "Auth users, profiles, platform roles, and tenants are preserved.\n"
  );

  await truncateTables();
  await clearStorage();

  console.log("\n✅ Database reset complete. Ready for fresh data.\n");
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
