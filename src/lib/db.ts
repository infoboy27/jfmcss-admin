import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { log } from "./log";

const globalPg = globalThis as unknown as { jfmcssPool?: Pool };

export const pool = globalPg.jfmcssPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

// Without this handler an error on an *idle* pooled client (e.g. the DB closing
// the connection) is emitted as an 'error' event with no listener and crashes
// the process.
if (!globalPg.jfmcssPool) {
  pool.on("error", (err) => log.error("pg idle client error", err, { component: "db" }));
}

globalPg.jfmcssPool = pool;

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const NUMBER_COLUMN = { invoices: "number", tickets: "number", projects: "code", proposals: "number" } as const;

/**
 * Allocates the next `PREFIX-YEAR-00001` human identifier for a table.
 *
 * MUST be called inside a `tx()` and paired with the INSERT that consumes the
 * number in the same transaction: it takes a transaction-scoped advisory lock so
 * two concurrent creators can't read the same MAX and collide on the unique
 * index. The lock is released automatically at COMMIT/ROLLBACK.
 */
export async function nextHumanNumber(
  client: PoolClient,
  prefix: string,
  table: keyof typeof NUMBER_COLUMN,
) {
  const column = NUMBER_COLUMN[table];
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`jfmcss-number-${table}`]);
  const year = new Date().getFullYear();
  const { rows } = await client.query<{ value: string }>(
    `SELECT ${column} AS value FROM ${table} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
    [`${prefix}-${year}-%`],
  );
  const last = rows[0]?.value?.split("-").at(-1);
  const next = (Number(last) || 0) + 1;
  return `${prefix}-${year}-${String(next).padStart(5, "0")}`;
}
