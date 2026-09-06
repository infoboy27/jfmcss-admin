import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalPg = globalThis as unknown as { jfmcssPool?: Pool };

export const pool = globalPg.jfmcssPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

if (process.env.NODE_ENV !== "production") globalPg.jfmcssPool = pool;

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

export async function nextHumanNumber(prefix: string, table: "invoices" | "tickets" | "projects") {
  const year = new Date().getFullYear();
  const column = table === "tickets" ? "number" : table === "projects" ? "code" : "number";
  const pattern = `${prefix}-${year}-%`;
  const { rows } = await query<{ value: string }>(
    `SELECT ${column} AS value FROM ${table} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
    [pattern],
  );
  const last = rows[0]?.value?.split("-").at(-1);
  const next = (Number(last) || 0) + 1;
  return `${prefix}-${year}-${String(next).padStart(5, "0")}`;
}
