/**
 * Reset Database — Wipe all project data and storage.
 *
 * Preserves: schema, extensions, RLS policies, functions, auth users, profiles.
 * Deletes:   all projects, interviews, chunks, entities, reports, snippets, storage files.
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

async function clearStorage() {
  console.log("\n🗑️  Clearing storage bucket: interview-audio ...");

  const { data: files, error: listError } = await admin.storage
    .from("interview-audio")
    .list("", { limit: 1000 });

  if (listError) {
    console.warn("  ⚠️  Could not list storage files:", listError.message);
    return;
  }

  if (!files || files.length === 0) {
    console.log("  ✓ Bucket already empty.");
    return;
  }

  const paths = files.map((f) => f.name);
  const { error: removeError } = await admin.storage
    .from("interview-audio")
    .remove(paths);

  if (removeError) {
    console.warn("  ⚠️  Could not remove files:", removeError.message);
  } else {
    console.log(`  ✓ Removed ${paths.length} file(s).`);
  }
}

async function truncateTables() {
  console.log("\n🧹 Truncating all data tables ...");

  const { error } = await admin.rpc("exec_sql" as never, {
    query: `
      TRUNCATE TABLE
        reports,
        content_snippets,
        entity_relationships,
        entity_mentions,
        interview_chunks,
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
  const tables = [
    "reports",
    "content_snippets",
    "entity_relationships",
    "entity_mentions",
    "interview_chunks",
    "entities",
    "interviews",
    "project_members",
    "projects",
  ];

  for (const table of tables) {
    const { error } = await admin.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.warn(`  ⚠️  ${table}: ${error.message}`);
    } else {
      console.log(`  ✓ ${table} cleared.`);
    }
  }
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  SOVEREIGN DATA — DATABASE RESET");
  console.log("═══════════════════════════════════════");
  console.log(`\nTarget: ${supabaseUrl}`);
  console.log("This will DELETE all projects, interviews, entities, reports, and audio files.");
  console.log("Auth users and profiles will be preserved.\n");

  await truncateTables();
  await clearStorage();

  console.log("\n✅ Database reset complete. Ready for fresh data.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
