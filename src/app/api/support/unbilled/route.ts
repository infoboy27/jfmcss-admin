import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, ok } from "@/lib/http";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Unbilled billable support time, grouped by client, with a projected amount at
 * the configured hourly rate. Feeds the "generar factura" flow.
 */
export async function GET() {
  try {
    await requireUser(["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT"]);
    const cfg = (await query<{ value: any }>(`SELECT value FROM settings WHERE key='support'`)).rows[0]?.value ?? {};
    const rate = Number(cfg.hourlyRate) || 2500;

    const { rows } = await query<any>(
      `SELECT c.id client_id, c.name client_name,
              count(DISTINCT e.ticket_id)::int ticket_count,
              count(e.id)::int entry_count,
              coalesce(sum(e.minutes),0)::int minutes
         FROM ticket_time_entries e
         JOIN tickets t ON t.id = e.ticket_id
         JOIN clients c ON c.id = t.client_id
        WHERE e.billable = true AND e.invoice_id IS NULL
        GROUP BY c.id, c.name
       HAVING coalesce(sum(e.minutes),0) > 0
        ORDER BY minutes DESC`,
    );

    const clients = rows.map((r) => ({
      ...r,
      hours: Math.round((r.minutes / 60) * 100) / 100,
      amount: Math.round((r.minutes / 60) * rate * 100) / 100,
    }));
    return ok({ hourlyRate: rate, currency: cfg.currency || "DOP", clients });
  } catch (e) {
    return apiError(e);
  }
}
