#!/usr/bin/env tsx
/**
 * Apply a migration inside BEGIN/ROLLBACK against the remote Supabase
 * database, optionally run a smoke SELECT, and report.
 *
 * Why: `supabase db push --dry-run` only tells us which migrations are
 * pending — it does not parse the SQL or execute anything. For risky
 * migrations we want to confirm:
 *   - the SQL parses against the actual remote schema,
 *   - the resulting object (function/table/index) is callable / queryable,
 *   - nothing persists.
 *
 * This script BEGIN-applies the migration, runs an optional smoke SQL
 * (e.g. `SELECT count(*) FROM entity_intel('…', NULL);`), then ROLLBACK.
 *
 * Usage:
 *   npx tsx scripts/db/migration-dry-run.ts \
 *     --migration supabase/migrations/00026_entity_intel_rpc.sql \
 *     [--probe "SELECT count(*) FROM entity_intel(…)"]
 *
 * Connection precedence: DATABASE_URL_DIRECT > DATABASE_URL_POOLER > DATABASE_URL.
 *
 * Sacred patterns (HANDOVER.md): does not modify Supabase config; uses
 * the same env vars as scripts/audit/database-baseline.ts; never prints
 * the connection string.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnv({ path: ".env.local", override: false });

interface Args {
  migration: string;
  probe: string | null;
}

function parseArgs(argv: string[]): Args {
  let migration: string | null = null;
  let probe: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--migration" || a === "-m") {
      migration = argv[++i] ?? null;
    } else if (a === "--probe" || a === "-p") {
      probe = argv[++i] ?? null;
    }
  }
  if (!migration) {
    console.error(
      "Usage: npx tsx scripts/db/migration-dry-run.ts --migration <path.sql> [--probe <sql>]",
    );
    process.exit(1);
  }
  return { migration, probe };
}

async function pickConnection(): Promise<{ name: string; url: string }> {
  const candidates: { name: string; url: string }[] = (
    [
      { name: "DATABASE_URL_DIRECT", url: process.env.DATABASE_URL_DIRECT },
      { name: "DATABASE_URL_POOLER", url: process.env.DATABASE_URL_POOLER },
      { name: "DATABASE_URL", url: process.env.DATABASE_URL },
    ] as const
  ).flatMap((c) => (c.url ? [{ name: c.name, url: c.url }] : []));

  if (candidates.length === 0) {
    console.error(
      "Missing DATABASE_URL_DIRECT / DATABASE_URL_POOLER / DATABASE_URL in .env.local.",
    );
    process.exit(1);
  }

  let lastErr: unknown = null;
  for (const cand of candidates) {
    process.stderr.write(`▶ trying ${cand.name}\n`);
    const probe = new Client({
      connectionString: cand.url,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 10_000,
    });
    try {
      await probe.connect();
      await probe.query("SELECT 1");
      await probe.end();
      return cand;
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ✗ ${cand.name}: ${code ?? "?"} ${msg}\n`);
      try {
        await probe.end();
      } catch {
        /* probe already closed */
      }
    }
  }
  console.error("\nAll candidate connections failed. Last error:");
  console.error(lastErr);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const migrationPath = resolve(process.cwd(), args.migration);
  const sql = readFileSync(migrationPath, "utf8");

  const { name, url } = await pickConnection();
  process.stderr.write(`✓ using ${name}\n`);

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30_000,
  });
  await client.connect();

  let applied = false;
  try {
    process.stderr.write(`▶ BEGIN\n`);
    await client.query("BEGIN");

    process.stderr.write(`▶ applying ${args.migration}\n`);
    await client.query(sql);
    applied = true;
    process.stderr.write(`✓ migration applied (will be rolled back)\n`);

    if (args.probe) {
      process.stderr.write(`▶ probe: ${args.probe}\n`);
      const result = await client.query(args.probe);
      process.stderr.write(
        `✓ probe returned rowCount=${result.rowCount ?? 0}\n`,
      );
      if (result.rows && result.rows.length > 0) {
        const first = result.rows[0];
        const cols = Object.keys(first).slice(0, 6);
        const sampleLine = cols
          .map((c) => `${c}=${JSON.stringify(first[c])}`)
          .join(" ");
        process.stderr.write(`  first row: ${sampleLine}\n`);
      }
    }

    process.stderr.write(`▶ ROLLBACK\n`);
    await client.query("ROLLBACK");
    process.stderr.write(`✓ rolled back — no changes persisted\n`);
    process.exit(0);
  } catch (err) {
    if (applied) {
      try {
        await client.query("ROLLBACK");
        process.stderr.write(`▼ rolled back after error\n`);
      } catch {
        /* ignore secondary error */
      }
    }
    console.error("\n✗ dry-run failed:");
    console.error(err);
    process.exit(2);
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
