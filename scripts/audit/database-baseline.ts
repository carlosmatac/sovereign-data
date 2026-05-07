/**
 * Database baseline audit — runs the read-only audit queries from
 * docs/audits/database-retrieval-architecture-audit.md §12 against the
 * live database and emits a markdown report.
 *
 * Used by Phase 0 / PR 0.1 of the database refactor plan
 * (docs/roadmaps/database-refactor-plan.md). Per plan §9c, this script
 * is intentionally re-runnable after every phase so we can verify the
 * orphan / duplicate / anchor-only counts move in the expected direction.
 *
 * Usage:
 *   npx tsx scripts/audit/database-baseline.ts                  # markdown to stdout
 *   npx tsx scripts/audit/database-baseline.ts --out report.md  # write to file
 *   npx tsx scripts/audit/database-baseline.ts --rows 5         # show top 5 sample rows per query (default 3)
 *
 * Requires one of these in .env.local, in Postgres connection-string form:
 *   - DATABASE_URL_DIRECT  (preferred — Direct connection)
 *       postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
 *   - DATABASE_URL_POOLER  (fallback — Session pooler)
 *       postgresql://postgres.<project-ref>:<password>@aws-X-<region>.pooler.supabase.com:5432/postgres
 *   - DATABASE_URL         (legacy single-name form, last fallback)
 * (Get them from the Supabase Dashboard → Project Settings → Database.)
 *
 * Read-only: every query in scripts/audit/queries/ is a SELECT. The script
 * sets `default_transaction_read_only = on` for its session as a belt-and-
 * braces check before running anything.
 */

import { config as loadDotenv } from "dotenv";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Client, type QueryResult } from "pg";

loadDotenv({ path: ".env.local" });

const QUERIES_DIR = path.join(__dirname, "queries");

type Args = {
  outPath?: string;
  sampleRows: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { sampleRows: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) {
      args.outPath = argv[++i];
    } else if (a === "--rows" && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 0) throw new Error(`--rows must be a non-negative integer, got ${argv[i]}`);
      args.sampleRows = n;
    }
  }
  return args;
}

function readQueryFile(file: string): { name: string; description: string; sql: string } {
  const sql = readFileSync(path.join(QUERIES_DIR, file), "utf8");
  // Filename pattern: 12-NN-slug.sql ; convert to "§12.NN — slug".
  const m = file.match(/^12-(\d{2})-(.+)\.sql$/);
  const num = m ? `§12.${Number(m[1])}` : file;
  const slug = m ? m[2].replace(/-/g, " ") : file;
  // Pull the first `-- audit §X.Y — description` line, if present, as canonical description.
  const descLine = sql.split(/\r?\n/).find((l) => l.startsWith("-- audit"));
  const description = descLine?.replace(/^--\s*/, "") ?? `${num} — ${slug}`;
  return { name: num, description, sql };
}

function formatMarkdownTable(rows: Record<string, unknown>[], maxRows: number): string {
  if (rows.length === 0) return "_(no rows)_";
  const sample = rows.slice(0, maxRows);
  const cols = Object.keys(sample[0]);
  const head = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = sample
    .map((r) => `| ${cols.map((c) => formatCell(r[c])).join(" | ")} |`)
    .join("\n");
  const more = rows.length > sample.length ? `\n_… ${rows.length - sample.length} more row(s) not shown_` : "";
  return [head, sep, body].join("\n") + more;
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return `[${v.map((x) => formatCell(x)).join(", ")}]`;
  if (typeof v === "object") {
    try {
      return "`" + JSON.stringify(v) + "`";
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function runQuery(client: Client, sql: string): Promise<QueryResult> {
  // Run in an explicit read-only transaction. Any accidental DML aborts.
  await client.query("BEGIN READ ONLY");
  try {
    const result = await client.query(sql);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const candidates: { name: string; url: string }[] = (
    [
      { name: "DATABASE_URL_DIRECT", url: process.env.DATABASE_URL_DIRECT },
      { name: "DATABASE_URL_POOLER", url: process.env.DATABASE_URL_POOLER },
      { name: "DATABASE_URL", url: process.env.DATABASE_URL },
    ] as const
  ).flatMap((c) => (c.url ? [{ name: c.name, url: c.url }] : []));

  if (candidates.length === 0) {
    console.error(
      [
        "Missing DATABASE_URL_DIRECT / DATABASE_URL_POOLER / DATABASE_URL in .env.local.",
        "",
        "Add at least one of these from Supabase Dashboard → Project Settings → Database → Connection string:",
        "  DATABASE_URL_DIRECT=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres",
        "  DATABASE_URL_POOLER=postgresql://postgres.<ref>:<password>@aws-X-<region>.pooler.supabase.com:5432/postgres",
      ].join("\n"),
    );
    process.exit(1);
  }

  let chosen: { name: string; url: string } | null = null;
  let lastErr: unknown = null;
  // Try each candidate in order; first that successfully connects wins.
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
      chosen = cand;
      break;
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

  if (!chosen) {
    console.error("\nAll candidate connections failed. Last error:");
    console.error(lastErr);
    process.exit(1);
  }

  process.stderr.write(`✓ using ${chosen.name}\n`);
  const databaseUrl = chosen.url;

  const queryFiles = readdirSync(QUERIES_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const lines: string[] = [];
  const stamp = new Date().toISOString().replace(/T/, " ").replace(/\.\d+Z$/, "Z");
  lines.push(`# Database baseline audit results`);
  lines.push("");
  lines.push(`_Generated by \`scripts/audit/database-baseline.ts\` at ${stamp}._`);
  lines.push("");
  lines.push(
    `Source queries: \`docs/audits/database-retrieval-architecture-audit.md\` §12.1–§12.16 plus PR-2.3 follow-ups §12.17 / §12.18, mirrored 1:1 in \`scripts/audit/queries/\`.`,
  );
  lines.push("");
  lines.push(`| # | Description | Row count | Notes |`);
  lines.push(`| --- | --- | ---: | --- |`);

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30_000,
  });

  await client.connect();
  await client.query("SET default_transaction_read_only = on");

  const summary: { name: string; description: string; rowCount: number }[] = [];
  const detail: string[] = [];

  for (const file of queryFiles) {
    const { name, description, sql } = readQueryFile(file);
    process.stderr.write(`▶ ${name} ${file}\n`);
    let rowCount = 0;
    let detailBlock = "";
    try {
      const result = await runQuery(client, sql);
      rowCount = result.rowCount ?? result.rows.length;
      detailBlock = formatMarkdownTable(result.rows as Record<string, unknown>[], args.sampleRows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      detailBlock = `**ERROR:** \`${msg}\``;
      summary.push({ name, description, rowCount: -1 });
      detail.push(`### ${name} — ${description}\n\n${detailBlock}\n`);
      continue;
    }
    summary.push({ name, description, rowCount });
    detail.push(`### ${name} — ${description}\n\n**Rows:** ${rowCount}\n\n${detailBlock}\n`);
  }

  await client.end();

  for (const row of summary) {
    const desc = row.description.replace(/\|/g, "\\|");
    const count = row.rowCount === -1 ? "ERROR" : String(row.rowCount);
    lines.push(`| ${row.name} | ${desc} | ${count} | |`);
  }

  lines.push("");
  lines.push(`---`);
  lines.push("");
  lines.push(`## Per-query detail`);
  lines.push("");
  lines.push(detail.join("\n"));

  const out = lines.join("\n");

  if (args.outPath) {
    mkdirSync(path.dirname(args.outPath), { recursive: true });
    writeFileSync(args.outPath, out);
    process.stderr.write(`\n✓ Wrote ${args.outPath}\n`);
  } else {
    process.stdout.write(out);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
