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
  lockTimeout: string;
  statementTimeout: string;
  lockCheckTables: string[];
}

function parseArgs(argv: string[]): Args {
  let migration: string | null = null;
  let probe: string | null = null;
  let lockTimeout = "5s";
  let statementTimeout = "60s";
  let lockCheckTables: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--migration" || a === "-m") {
      migration = argv[++i] ?? null;
    } else if (a === "--probe" || a === "-p") {
      probe = argv[++i] ?? null;
    } else if (a === "--lock-timeout") {
      lockTimeout = argv[++i] ?? lockTimeout;
    } else if (a === "--statement-timeout") {
      statementTimeout = argv[++i] ?? statementTimeout;
    } else if (a === "--lock-check") {
      lockCheckTables = (argv[++i] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (!migration) {
    console.error(
      "Usage: npx tsx scripts/db/migration-dry-run.ts --migration <path.sql>\n" +
        "        [--probe <sql>]\n" +
        "        [--lock-timeout <interval>     default 5s]\n" +
        "        [--statement-timeout <interval> default 60s]\n" +
        "        [--lock-check <comma,separated,tables>]",
    );
    process.exit(1);
  }
  return { migration, probe, lockTimeout, statementTimeout, lockCheckTables };
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
    statement_timeout: 90_000,
  });
  await client.connect();

  let applied = false;
  try {
    process.stderr.write(`▶ BEGIN\n`);
    await client.query("BEGIN");

    process.stderr.write(
      `▶ SET LOCAL lock_timeout=${args.lockTimeout} statement_timeout=${args.statementTimeout}\n`,
    );
    await client.query(`SET LOCAL lock_timeout = '${args.lockTimeout}'`);
    await client.query(
      `SET LOCAL statement_timeout = '${args.statementTimeout}'`,
    );
    await client.query(`SET LOCAL application_name = 'migration-dry-run'`);

    if (args.lockCheckTables.length > 0) {
      process.stderr.write(
        `▶ pre-flight lock check on: ${args.lockCheckTables.join(", ")}\n`,
      );
      const lockSql = `
        SELECT
          c.relname                AS relation,
          l.mode                   AS lock_mode,
          l.granted                AS granted,
          a.pid                    AS pid,
          a.application_name       AS app,
          a.usename                AS usr,
          a.state                  AS state,
          left(a.query, 120)       AS query_excerpt,
          (now() - a.query_start)  AS query_age
        FROM pg_locks l
        JOIN pg_class c       ON c.oid = l.relation
        JOIN pg_namespace n   ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE n.nspname = 'public'
          AND c.relname = ANY($1::text[])
          AND a.pid <> pg_backend_pid()
        ORDER BY c.relname, l.granted DESC, l.mode
      `;
      const locks = await client.query(lockSql, [args.lockCheckTables]);
      if (locks.rowCount === 0) {
        process.stderr.write(`  (no other sessions hold locks on these)\n`);
      } else {
        for (const r of locks.rows) {
          process.stderr.write(
            `  ⚠ ${r.relation} ${r.lock_mode} granted=${r.granted} pid=${r.pid} app=${r.app ?? "?"} state=${r.state ?? "?"} age=${r.query_age ?? "?"}\n` +
              `    query: ${r.query_excerpt ?? "?"}\n`,
          );
        }
      }
    }

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
    // Always attempt a ROLLBACK so the connection doesn't linger in a failed
    // transaction state, regardless of whether the failure happened before
    // the migration was fully applied.
    try {
      await client.query("ROLLBACK");
      process.stderr.write(
        applied
          ? `▼ rolled back after error (post-apply)\n`
          : `▼ rolled back after error (pre-apply)\n`,
      );
    } catch (rollbackErr) {
      process.stderr.write(
        `! ROLLBACK itself failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}\n`,
      );
    }
    const e = err as {
      code?: string;
      message?: string;
      severity?: string;
      detail?: string;
      hint?: string;
      where?: string;
      position?: string;
      internalQuery?: string;
    };
    console.error("\n✗ dry-run failed:");
    console.error(`  code:     ${e.code ?? "?"}`);
    console.error(`  severity: ${e.severity ?? "?"}`);
    console.error(`  message:  ${e.message ?? String(err)}`);
    if (e.detail) console.error(`  detail:   ${e.detail}`);
    if (e.hint) console.error(`  hint:     ${e.hint}`);
    if (e.where) console.error(`  where:    ${e.where}`);
    if (e.position) console.error(`  position: ${e.position}`);
    if (e.internalQuery) console.error(`  internalQuery: ${e.internalQuery}`);
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
