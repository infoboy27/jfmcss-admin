import { execFileSync } from "node:child_process";
import { Pool } from "pg";

/**
 * Shared harness for DB-backed tests. Skipped entirely unless DATABASE_URL is
 * set (CI provides a throwaway Postgres; `npm test` locally does not).
 */
export const DB_URL = process.env.DATABASE_URL;
export const hasDb = Boolean(DB_URL);

export const pool = hasDb ? new Pool({ connectionString: DB_URL, max: 8 }) : (null as unknown as Pool);

export function migrate() {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: DB_URL },
  });
}

export async function reset() {
  // Order matters for FKs; TRUNCATE ... CASCADE handles the rest.
  await pool.query(`
    TRUNCATE users, sessions, clients, client_contacts, opportunities, projects, project_tasks,
             invoices, invoice_items, payments, tickets, ticket_messages, ticket_time_entries,
             assets, documents, notifications, notification_prefs,
             automation_rules, automation_runs, audit_log,
             proposals, proposal_items, proposal_milestones
      RESTART IDENTITY CASCADE
  `);
  await pool.query(`UPDATE fiscal_sequences SET next_number = 1`);
}

export async function makeClient(name = "Cliente Test") {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO clients(name) VALUES ($1) RETURNING id`,
    [name],
  );
  return rows[0].id;
}
