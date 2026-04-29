/**
 * Reset Database — Wipe all project data and storage.
 *
 * Preserves: schema, extensions, RLS policies, functions, auth users, profiles,
 *            and platform roles.
 * Deletes:   all projects, interviews, chunks, entities, aliases, positions,
 *            reports, snippets, chats, and storage files.
 *
 * Usage:  npx tsx scripts/reset-database.ts
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

type DataTable = {
  name: string;
  nonNullColumn: string;
};

const DATA_TABLES: DataTable[] = [
  { name: "chat_messages", nonNullColumn: "id" },
  { name: "chat_conversation_seq", nonNullColumn: "conversation_id" },
  { name: "chat_conversations", nonNullColumn: "id" },
  { name: "reports", nonNullColumn: "id" },
  { name: "content_snippets", nonNullColumn: "id" },
  { name: "entity_relationships", nonNullColumn: "id" },
  { name: "entity_mentions", nonNullColumn: "id" },
  { name: "interview_review_entities", nonNullColumn: "id" },
  { name: "interview_chunks", nonNullColumn: "id" },
  { name: "validated_positions", nonNullColumn: "id" },
  { name: "entity_aliases", nonNullColumn: "id" },
  { name: "interviews", nonNullColumn: "id" },
  { name: "entities", nonNullColumn: "id" },
  { name: "project_members", nonNullColumn: "id" },
  { name: "projects", nonNullColumn: "id" },
];

function joinStoragePath(prefix: string, name: string) {
  return prefix ? `${prefix}/${name}` : name;
}

async function listStorageFiles(prefix = ""): Promise<string[]> {
  const limit = 1000;
  let offset = 0;
  const paths: string[] = [];

  while (true) {
    const { data, error } = await admin.storage
      .from("interview-audio")
      .list(prefix, { limit, offset });

    if (error) {
      throw new Error(`Could not list storage path "${prefix || "/"}": ${error.message}`);
    }

    const entries = (data ?? []) as StorageEntry[];

    for (const entry of entries) {
      const path = joinStoragePath(prefix, entry.name);

      if (entry.id) {
        paths.push(path);
      } else {
        paths.push(...(await listStorageFiles(path)));
      }
    }

    if (entries.length < limit) break;
    offset += limit;
  }

  return paths;
}

async function clearStorage() {
  console.log("\n🗑️  Clearing storage bucket: interview-audio ...");

  const paths = await listStorageFiles();

  if (paths.length === 0) {
    console.log("  ✓ Bucket already empty.");
    return;
  }

  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await admin.storage.from("interview-audio").remove(batch);

    if (error) {
      throw new Error(`Could not remove storage files: ${error.message}`);
    }
  }

  console.log(`  ✓ Removed ${paths.length} file(s).`);
}

async function truncateTables() {
  console.log("\n🧹 Truncating all data tables ...");

  const { error } = await admin.rpc("exec_sql" as never, {
    query: `
      TRUNCATE TABLE
        chat_messages,
        chat_conversation_seq,
        chat_conversations,
        reports,
        content_snippets,
        entity_relationships,
        entity_mentions,
        interview_review_entities,
        interview_chunks,
        validated_positions,
        entity_aliases,
        interviews,
        entities,
        project_members,
        projects
      CASCADE;
    `,
  } as never);

  if (error) {
    // If the RPC doesn't exist, fall back to manual deletes in dependency order
    console.log("  ℹ️  exec_sql RPC not available, using row-level deletes ...");
    await deleteInOrder();
  } else {
    console.log("  ✓ All tables truncated.");
  }
}

async function deleteInOrder() {
  const { error: canonicalResetError } = await admin
    .from("entities")
    .update({ canonical_entity_id: null })
    .not("canonical_entity_id", "is", null);

  if (canonicalResetError) {
    throw new Error(`entities canonical reset failed: ${canonicalResetError.message}`);
  }

  for (const table of DATA_TABLES) {
    const { count, error } = await admin
      .from(table.name)
      .delete({ count: "exact" })
      .not(table.nonNullColumn, "is", null);

    if (error) {
      throw new Error(`${table.name}: ${error.message}`);
    }

    console.log(`  ✓ ${table.name} cleared${count === null ? "" : ` (${count} row(s))`}.`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  SOVEREIGN DATA — DATABASE RESET");
  console.log("═══════════════════════════════════════");
  console.log(`\nTarget: ${supabaseUrl}`);
  console.log("This will DELETE all product data, chats, graph data, reports, and audio files.");
  console.log("Auth users, profiles, and platform roles will be preserved.\n");

  await truncateTables();
  await clearStorage();

  console.log("\n✅ Database reset complete. Ready for fresh data.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
