#!/usr/bin/env node
/**
 * Minimal forward-only migration runner.
 *
 *   node scripts/migrate.mjs          # apply every pending migration
 *   node scripts/migrate.mjs --status # list applied vs pending, exit 0
 *
 * Each file in db/migrations/ (NNNN_name.sql, ascending) runs once, inside its
 * own transaction, and is recorded in schema_migrations. A `-- migrate:no-transaction`
 * marker on the first line opts a file out of the wrapping transaction (needed
 * for statements Postgres won't run in one, e.g. CREATE INDEX CONCURRENTLY).
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const statusOnly = process.argv.includes("--status");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

await client.connect();
try {
  // Serialize concurrent runners (parallel test workers, or the compose migrate
  // service racing a manual run) — the session lock releases on client.end().
  if (!statusOnly) await client.query(`SELECT pg_advisory_lock(hashtext('jfmcss-migrate'))`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Map(
    (await client.query(`SELECT version, checksum FROM schema_migrations`)).rows.map((r) => [r.version, r.checksum]),
  );

  let pending = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const body = await readFile(join(dir, file), "utf8");
    const checksum = sha(body);

    if (applied.has(version)) {
      if (applied.get(version) !== checksum) {
        console.error(`✗ ${version} was modified after being applied (checksum mismatch). Add a new migration instead.`);
        process.exit(1);
      }
      if (statusOnly) console.log(`  applied  ${version}`);
      continue;
    }

    pending++;
    if (statusOnly) {
      console.log(`  PENDING  ${version}`);
      continue;
    }

    const noTx = /^--\s*migrate:no-transaction/.test(body);
    console.log(`→ applying ${version}${noTx ? " (no transaction)" : ""}`);
    try {
      if (!noTx) await client.query("BEGIN");
      await client.query(body);
      await client.query(`INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)`, [version, checksum]);
      if (!noTx) await client.query("COMMIT");
    } catch (err) {
      if (!noTx) await client.query("ROLLBACK").catch(() => {});
      console.error(`✗ ${version} failed:`, err.message);
      process.exit(1);
    }
  }

  console.log(statusOnly ? `\n${pending} pending` : pending === 0 ? "Database is up to date." : `Applied ${pending} migration(s).`);
} finally {
  await client.end();
}
