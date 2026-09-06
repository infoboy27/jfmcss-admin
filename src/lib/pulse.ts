import { query } from "./db";
import type { SessionUser } from "./auth";
import { clientScope } from "./scope";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PulseItem = {
  id: string;
  type: "invoice_overdue" | "sla_risk" | "renewal" | "proposal_stale" | "project_late" | "health_drop" | "recurring_due";
  priority: 1 | 2 | 3; // 1 = act now
  title: string;
  detail: string;
  impact: number; // RD$ at stake, 0 if not monetary
  module: string; // which workspace tab to open
};

/**
 * "What needs my attention today." A prioritised, deduplicated feed of concrete
 * items with the money at stake, sorted by (priority, impact).
 */
export async function buildPulse(user: SessionUser): Promise<{ items: PulseItem[]; protectedAmount: number }> {
  const s = clientScope(user, "i.client_id");
  const items: PulseItem[] = [];

  // Overdue invoices, grouped.
  const overdue = (
    await query<any>(
      `SELECT count(*)::int n, coalesce(sum(i.total - i.paid_amount),0) amt, min(i.due_date) oldest
         FROM invoices i ${s.where ? s.where + " AND" : "WHERE"} i.document_kind='INVOICE'
          AND i.status IN ('ISSUED','PARTIAL','OVERDUE') AND i.due_date < CURRENT_DATE`,
      s.params,
    )
  ).rows[0];
  if (Number(overdue.n) > 0) {
    items.push({
      id: "invoices:overdue",
      type: "invoice_overdue",
      priority: 1,
      title: `${overdue.n} factura(s) vencida(s)`,
      detail: `RD$${Number(overdue.amt).toLocaleString("en-US")} · la más antigua vence ${new Date(overdue.oldest).toLocaleDateString("es-DO")}`,
      impact: Number(overdue.amt),
      module: "payments",
    });
  }

  // Tickets over 80 % of their resolution SLA.
  const slaScope = clientScope(user, "t.client_id");
  const slaRisk = (
    await query<any>(
      `SELECT t.number, t.subject, c.name client_name, t.resolution_due_at
         FROM tickets t JOIN clients c ON c.id=t.client_id
        ${slaScope.where ? slaScope.where + " AND" : "WHERE"} t.status NOT IN ('RESOLVED','CLOSED')
          AND t.resolution_due_at IS NOT NULL
          AND now() >= t.created_at + (t.resolution_due_at - t.created_at) * 0.8
        ORDER BY t.resolution_due_at
        LIMIT 5`,
      slaScope.params,
    )
  ).rows;
  for (const t of slaRisk) {
    const overdueNow = new Date(t.resolution_due_at) < new Date();
    items.push({
      id: `ticket:${t.number}`,
      type: "sla_risk",
      priority: overdueNow ? 1 : 2,
      title: overdueNow ? `SLA incumplido · ${t.number}` : `SLA en riesgo · ${t.number}`,
      detail: `${t.client_name} · ${t.subject}`,
      impact: 0,
      module: "support",
    });
  }

  // Renewals in the next 14 days.
  const aScope = clientScope(user, "a.client_id");
  const renewals = (
    await query<any>(
      `SELECT a.name, a.type, a.renewal_date, c.name client_name, a.recurring_price,
              (a.renewal_date - CURRENT_DATE)::int days
         FROM assets a JOIN clients c ON c.id=a.client_id
        ${aScope.where ? aScope.where + " AND" : "WHERE"} a.status='ACTIVE'
          AND a.renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
        ORDER BY a.renewal_date
        LIMIT 6`,
      aScope.params,
    )
  ).rows;
  for (const r of renewals) {
    items.push({
      id: `renewal:${r.name}:${r.renewal_date}`,
      type: "renewal",
      priority: r.days <= 5 ? 1 : 2,
      title: `Renovación en ${r.days} día(s): ${r.name}`,
      detail: `${r.client_name} · ${r.type}`,
      impact: Number(r.recurring_price) || 0,
      module: "assets",
    });
  }

  // Proposals sent/viewed with no answer for >7 days.
  if (user.role !== "CLIENT") {
    const stale = (
      await query<any>(
        `SELECT p.number, p.title, p.total, c.name client_name, (CURRENT_DATE - p.sent_at::date)::int days
           FROM proposals p JOIN clients c ON c.id=p.client_id
          WHERE p.status IN ('SENT','VIEWED') AND p.sent_at < now() - interval '7 days'
          ORDER BY p.total DESC LIMIT 5`,
      )
    ).rows;
    for (const p of stale) {
      items.push({
        id: `proposal:${p.number}`,
        type: "proposal_stale",
        priority: Number(p.total) > 100000 ? 1 : 2,
        title: `Propuesta sin respuesta: ${p.number}`,
        detail: `${p.client_name} · RD$${Number(p.total).toLocaleString("en-US")} · hace ${p.days} días`,
        impact: Number(p.total) || 0,
        module: "proposals",
      });
    }
  }

  // Late projects.
  const pScope = clientScope(user, "p.client_id");
  const late = (
    await query<any>(
      `SELECT p.name, p.code, c.name client_name, (CURRENT_DATE - p.due_date)::int days, p.progress
         FROM projects p JOIN clients c ON c.id=p.client_id
        ${pScope.where ? pScope.where + " AND" : "WHERE"} p.status IN ('PLANNING','ACTIVE','ON_HOLD')
          AND p.due_date < CURRENT_DATE
        ORDER BY p.due_date LIMIT 5`,
      pScope.params,
    )
  ).rows;
  for (const p of late) {
    items.push({
      id: `project:${p.code}`,
      type: "project_late",
      priority: 2,
      title: `Proyecto retrasado ${p.days} día(s): ${p.name}`,
      detail: `${p.client_name} · ${p.progress}% completado`,
      impact: 0,
      module: "projects",
    });
  }

  // At-risk clients (staff only).
  if (user.role !== "CLIENT") {
    const risky = (
      await query<any>(`SELECT name, health_score FROM clients WHERE status='ACTIVE' AND health_score < 55 ORDER BY health_score LIMIT 5`)
    ).rows;
    for (const c of risky) {
      items.push({
        id: `health:${c.name}`,
        type: "health_drop",
        priority: c.health_score < 40 ? 1 : 3,
        title: `Cliente en riesgo: ${c.name}`,
        detail: `Health score ${c.health_score}/100`,
        impact: 0,
        module: "clients",
      });
    }
  }

  items.sort((a, b) => a.priority - b.priority || b.impact - a.impact);
  const protectedAmount = items.reduce((s, i) => s + i.impact, 0);
  return { items: items.slice(0, 12), protectedAmount: Math.round(protectedAmount) };
}
