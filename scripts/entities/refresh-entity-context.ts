/**
 * Backfill: generate description + entity_metadata_v1 for all canonical entities.
 *
 * Targets entities that have no schema_version="entity_metadata_v1" in metadata,
 * OR where the current description is shorter than MIN_DESCRIPTION_LENGTH chars.
 *
 * Usage:
 *   npx tsx scripts/entities/refresh-entity-context.ts
 *   npx tsx scripts/entities/refresh-entity-context.ts --project <project-uuid>
 *   npx tsx scripts/entities/refresh-entity-context.ts --dry-run
 *   npx tsx scripts/entities/refresh-entity-context.ts --force   # regenerate all, even those with v1 metadata
 *
 * Flags:
 *   --project <uuid>  Restrict to entities belonging to a specific project
 *   --dry-run         List targets without writing anything
 *   --force           Regenerate even entities that already have v1 metadata
 *   --concurrency <n> Max parallel LLM calls (default: 3)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { generateEntityContext } from "../../src/lib/entities/generate-entity-context";

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const projectId: string | null = projectFlag !== -1 ? (args[projectFlag + 1] ?? null) : null;
const isDryRun = args.includes("--dry-run");
const isForce = args.includes("--force");
const concurrencyFlag = args.indexOf("--concurrency");
const concurrency = concurrencyFlag !== -1 ? parseInt(args[concurrencyFlag + 1] ?? "3", 10) : 3;

const MIN_DESCRIPTION_LENGTH = 150;

// ── Env validation ────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!openaiKey) {
  console.error("Missing OPENAI_API_KEY in .env.local");
  process.exit(1);
}

// Verify OpenAI key is accessible (sdk reads from env)
const _openai = new OpenAI({ apiKey: openaiKey });
void _openai; // referenced to satisfy lint

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ── Fetch targets ─────────────────────────────────────────────────────────────

async function fetchTargetEntities() {
  let query = supabase
    .from("entities")
    .select("id, name, type, description, metadata, project_id")
    .is("canonical_entity_id", null)
    .order("created_at", { ascending: true });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch entities:", error);
    process.exit(1);
  }

  const all = data ?? [];
  if (isForce) return all;

  return all.filter((e) => {
    const meta = e.metadata as Record<string, unknown> | null;
    const hasV1 = meta?.schema_version === "entity_metadata_v1";
    const hasThinDesc = !e.description || e.description.length < MIN_DESCRIPTION_LENGTH;
    return !hasV1 || hasThinDesc;
  });
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  limit: number
): Promise<void> {
  let idx = 0;
  async function runNext(): Promise<void> {
    if (idx >= items.length) return;
    const current = idx++;
    await worker(items[current], current);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== refresh-entity-context ===");
  console.log(`project:     ${projectId ?? "all"}`);
  console.log(`dry-run:     ${isDryRun}`);
  console.log(`force:       ${isForce}`);
  console.log(`concurrency: ${concurrency}`);
  console.log();

  const targets = await fetchTargetEntities();
  console.log(`Found ${targets.length} entity/entities to process.`);

  if (targets.length === 0) {
    console.log("Nothing to do. All entities already have entity_metadata_v1.");
    return;
  }

  if (isDryRun) {
    console.log("\nDRY RUN — targets:");
    for (const e of targets) {
      const meta = e.metadata as Record<string, unknown> | null;
      const hasV1 = meta?.schema_version === "entity_metadata_v1";
      console.log(
        `  [${e.type.padEnd(24)}] ${e.name.padEnd(40)} desc=${String(e.description?.length ?? 0).padStart(4)}chars v1=${hasV1}`
      );
    }
    return;
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  await runWithConcurrency(
    targets,
    async (entity, i) => {
      const prefix = `[${i + 1}/${targets.length}] "${entity.name}" (${entity.type})`;
      try {
        await generateEntityContext({
          supabase: supabase as Parameters<typeof generateEntityContext>[0]["supabase"],
          entityId: entity.id,
          entityName: entity.name,
          entityType: entity.type as Parameters<typeof generateEntityContext>[0]["entityType"],
          projectId: entity.project_id,
        });
        succeeded++;
        console.log(`${prefix} ✓`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("skip")) {
          skipped++;
          console.log(`${prefix} — skipped (${msg})`);
        } else {
          failed++;
          console.error(`${prefix} ✗ ${msg}`);
        }
      }
    },
    concurrency
  );

  console.log();
  console.log(`=== Done ===`);
  console.log(`succeeded: ${succeeded}`);
  console.log(`skipped:   ${skipped}`);
  console.log(`failed:    ${failed}`);
  console.log(`total:     ${targets.length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
