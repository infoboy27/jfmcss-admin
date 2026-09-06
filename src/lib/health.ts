import { query } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type HealthFactor = { label: string; impact: number; detail: string };
export type HealthResult = {
  score: number;
  band: "healthy" | "attention" | "at_risk";
  factors: HealthFactor[];
};

const band = (s: number): HealthResult["band"] => (s >= 80 ? "healthy" : s >= 55 ? "attention" : "at_risk");

/**
 * Explainable client health score (0–100). Starts at 100; every negative signal
 * subtracts a capped amount and records *why*. Positive signals (paying on time,
 * active recurring revenue) add a little back.
 */
export async function computeHealth(clientId: string): Promise<HealthResult> {
  const [inv, tickets, sla, projects, activity, renewals, payments, mrr] = await Promise.all([
    query<any>(
      `SELECT
         count(*) FILTER (WHERE status IN ('ISSUED','PARTIAL','OVERDUE') AND due_date < CURRENT_DATE)::int overdue_count,
         coalesce(sum(total - paid_amount) FILTER (WHERE status IN ('ISSUED','PARTIAL','OVERDUE') AND due_date < CURRENT_DATE),0) overdue_amount,
         max(CURRENT_DATE - due_date) FILTER (WHERE status IN ('ISSUED','PARTIAL','OVERDUE') AND due_date < CURRENT_DATE)::int oldest_days
       FROM invoices WHERE client_id=$1 AND document_kind='INVOICE'`,
      [clientId],
    ),
    query<any>(
      `SELECT count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED'))::int open,
              count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED') AND priority='URGENT')::int urgent_open,
              count(*) FILTER (WHERE created_at > now() - interval '30 days')::int last30
       FROM tickets WHERE client_id=$1`,
      [clientId],
    ),
    query<any>(
      `SELECT count(*) FILTER (WHERE resolution_breached OR first_response_breached)::int breaches
       FROM tickets WHERE client_id=$1 AND created_at > now() - interval '90 days'`,
      [clientId],
    ),
    query<any>(
      `SELECT count(*) FILTER (WHERE status IN ('PLANNING','ACTIVE','ON_HOLD') AND due_date < CURRENT_DATE)::int overdue
       FROM projects WHERE client_id=$1`,
      [clientId],
    ),
    query<any>(
      `SELECT max(created_at) last_at FROM audit_log WHERE entity_id=$1
        OR entity_id IN (SELECT id::text FROM invoices WHERE client_id=$1)
        OR entity_id IN (SELECT id::text FROM tickets WHERE client_id=$1)`,
      [clientId],
    ),
    query<any>(
      `SELECT count(*) FILTER (WHERE renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14 AND status='ACTIVE')::int soon
       FROM assets WHERE client_id=$1`,
      [clientId],
    ),
    query<any>(
      `SELECT avg(GREATEST(0, EXTRACT(EPOCH FROM (p.paid_at::date - i.due_date)) / 86400))::numeric avg_late
       FROM payments p JOIN invoices i ON i.id = p.invoice_id
      WHERE i.client_id=$1 AND p.paid_at > now() - interval '180 days'`,
      [clientId],
    ),
    query<any>(`SELECT coalesce(sum(recurring_revenue),0) mrr FROM projects WHERE client_id=$1 AND status='ACTIVE'`, [clientId]),
  ]);

  const factors: HealthFactor[] = [];
  let score = 100;
  const hit = (label: string, impact: number, detail: string) => {
    if (impact === 0) return;
    score += impact;
    factors.push({ label, impact, detail });
  };

  const iv = inv.rows[0];
  if (Number(iv.overdue_count) > 0) {
    const pen = Math.min(30, Number(iv.overdue_count) * 6 + Math.min(15, Number(iv.oldest_days || 0) / 6));
    hit("Facturas vencidas", -Math.round(pen), `${iv.overdue_count} vencida(s) · RD$${Number(iv.overdue_amount).toLocaleString("en-US")} · hasta ${iv.oldest_days} días`);
  }

  const tk = tickets.rows[0];
  if (Number(tk.urgent_open) > 0) hit("Tickets urgentes abiertos", -Math.min(20, Number(tk.urgent_open) * 8), `${tk.urgent_open} urgente(s) sin resolver`);
  if (Number(tk.last30) >= 5) hit("Alta frecuencia de tickets", -Math.min(12, (Number(tk.last30) - 4) * 2), `${tk.last30} tickets en 30 días`);

  const br = Number(sla.rows[0].breaches);
  if (br > 0) hit("SLA incumplido", -Math.min(20, br * 5), `${br} incumplimiento(s) en 90 días`);

  const po = Number(projects.rows[0].overdue);
  if (po > 0) hit("Proyectos retrasados", -Math.min(15, po * 7), `${po} proyecto(s) pasados de fecha`);

  const lastAt = activity.rows[0]?.last_at ? new Date(activity.rows[0].last_at) : null;
  const daysSince = lastAt ? Math.floor((Date.now() - lastAt.getTime()) / 86400000) : 999;
  if (daysSince > 60) hit("Sin actividad reciente", -Math.min(12, Math.floor(daysSince / 30) * 3), `Última interacción hace ${daysSince > 900 ? "mucho tiempo" : daysSince + " días"}`);

  if (Number(renewals.rows[0].soon) > 0) hit("Renovación próxima sin confirmar", -4, `${renewals.rows[0].soon} activo(s) renuevan en ≤14 días`);

  const late = Number(payments.rows[0]?.avg_late || 0);
  if (late > 7) hit("Pagos con retraso habitual", -Math.min(15, Math.round(late / 3)), `Promedio ${Math.round(late)} días tarde`);
  else if (late >= 0 && payments.rows[0]?.avg_late != null && late <= 2) hit("Pagos puntuales", +5, "Historial de pago a tiempo");

  if (Number(mrr.rows[0].mrr) > 0) hit("Relación recurrente", +4, `MRR RD$${Number(mrr.rows[0].mrr).toLocaleString("en-US")}`);

  score = Math.max(0, Math.min(100, Math.round(score)));
  factors.sort((a, b) => a.impact - b.impact);
  return { score, band: band(score), factors };
}

/** Recompute + persist health for one client (or all). Returns the count. */
export async function refreshHealth(clientId?: string): Promise<number> {
  const ids = clientId
    ? [clientId]
    : (await query<{ id: string }>(`SELECT id FROM clients WHERE status IN ('ACTIVE','LEAD','PAUSED')`)).rows.map((r) => r.id);
  for (const id of ids) {
    const h = await computeHealth(id);
    await query(`UPDATE clients SET health_score=$2, updated_at=now() WHERE id=$1`, [id, h.score]);
  }
  return ids.length;
}
