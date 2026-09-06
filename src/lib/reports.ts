import { query } from "./db";
import type { SessionUser } from "./auth";
import { clientScope } from "./scope";

/* eslint-disable @typescript-eslint/no-explicit-any */

const OPEN_STATUSES = "('ISSUED','PARTIAL','OVERDUE')";

/** Accounts-receivable aging: outstanding balance bucketed by days past due. */
export async function arAging(user: SessionUser) {
  const s = clientScope(user, "i.client_id");

  const buckets = await query<any>(
    `SELECT
       coalesce(sum(bal) FILTER (WHERE due IS NULL OR due >= CURRENT_DATE), 0)                     AS current,
       coalesce(sum(bal) FILTER (WHERE due <  CURRENT_DATE AND due >= CURRENT_DATE - 30), 0)        AS d1_30,
       coalesce(sum(bal) FILTER (WHERE due <  CURRENT_DATE - 30 AND due >= CURRENT_DATE - 60), 0)   AS d31_60,
       coalesce(sum(bal) FILTER (WHERE due <  CURRENT_DATE - 60 AND due >= CURRENT_DATE - 90), 0)   AS d61_90,
       coalesce(sum(bal) FILTER (WHERE due <  CURRENT_DATE - 90), 0)                                AS d90_plus,
       coalesce(sum(bal), 0)                                                                        AS total,
       count(*)                                                                                     AS open_invoices
     FROM (
       SELECT i.total - i.paid_amount AS bal, i.due_date AS due
         FROM invoices i ${s.where ? s.where + " AND" : "WHERE"} i.document_kind = 'INVOICE'
          AND i.status IN ${OPEN_STATUSES}
     ) x`,
    s.params,
  );

  const byClient = await query<any>(
    `SELECT c.id, c.name,
            sum(i.total - i.paid_amount)                                       AS outstanding,
            sum(i.total - i.paid_amount) FILTER (WHERE i.due_date < CURRENT_DATE) AS overdue,
            min(i.due_date) FILTER (WHERE i.due_date < CURRENT_DATE)            AS oldest_due,
            count(*)                                                           AS invoices
       FROM invoices i JOIN clients c ON c.id = i.client_id
      ${s.where ? s.where + " AND" : "WHERE"} i.document_kind = 'INVOICE' AND i.status IN ${OPEN_STATUSES}
      GROUP BY c.id, c.name
      HAVING sum(i.total - i.paid_amount) > 0
      ORDER BY overdue DESC NULLS LAST, outstanding DESC`,
    s.params,
  );

  // Rough DSO: outstanding / (last-90-day revenue / 90).
  const dso = await query<{ dso: string | null }>(
    `SELECT CASE WHEN rev > 0 THEN round((ar / (rev / 90.0))::numeric, 1) END AS dso
       FROM (
         SELECT
           (SELECT coalesce(sum(total - paid_amount),0) FROM invoices
             WHERE document_kind='INVOICE' AND status IN ${OPEN_STATUSES}
               ${user.role === "CLIENT" ? "AND client_id = $1" : ""}) AS ar,
           (SELECT coalesce(sum(total),0) FROM invoices
             WHERE document_kind='INVOICE' AND status <> 'VOID' AND issue_date > CURRENT_DATE - 90
               ${user.role === "CLIENT" ? "AND client_id = $1" : ""}) AS rev
       ) t`,
    user.role === "CLIENT" ? [user.clientId] : [],
  );

  const b = buckets.rows[0] ?? {};
  const num = (v: any) => Math.round((Number(v) || 0) * 100) / 100;
  return {
    buckets: {
      current: num(b.current),
      "1-30": num(b.d1_30),
      "31-60": num(b.d31_60),
      "61-90": num(b.d61_90),
      "90+": num(b.d90_plus),
    },
    total: num(b.total),
    openInvoices: Number(b.open_invoices || 0),
    dso: dso.rows[0]?.dso != null ? Number(dso.rows[0].dso) : null,
    byClient: byClient.rows.map((r) => ({
      id: r.id,
      name: r.name,
      outstanding: num(r.outstanding),
      overdue: num(r.overdue),
      oldestDue: r.oldest_due,
      invoices: Number(r.invoices),
    })),
  };
}

/** Monthly revenue / collections / MRR over a date range. */
export async function revenueReport(user: SessionUser, from: string, to: string) {
  const clientFilter = user.role === "CLIENT" ? "AND client_id = $3" : "";
  const params: any[] = user.role === "CLIENT" ? [from, to, user.clientId] : [from, to];

  const monthly = await query<any>(
    `SELECT to_char(date_trunc('month', d), 'YYYY-MM') AS month,
            coalesce(inv.billed, 0)   AS billed,
            coalesce(pay.collected, 0) AS collected
       FROM generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month') d
       LEFT JOIN (
         SELECT date_trunc('month', issue_date) m, sum(total) billed
           FROM invoices WHERE document_kind='INVOICE' AND status <> 'VOID'
             AND issue_date BETWEEN $1 AND $2 ${clientFilter}
           GROUP BY 1
       ) inv ON inv.m = d
       LEFT JOIN (
         SELECT date_trunc('month', paid_at) m, sum(amount) collected
           FROM payments WHERE paid_at BETWEEN $1 AND $2 ${clientFilter}
           GROUP BY 1
       ) pay ON pay.m = d
      ORDER BY d`,
    params,
  );

  const totals = await query<any>(
    `SELECT
       (SELECT coalesce(sum(total),0) FROM invoices WHERE document_kind='INVOICE' AND status<>'VOID' AND issue_date BETWEEN $1 AND $2 ${clientFilter}) billed,
       (SELECT coalesce(sum(amount),0) FROM payments WHERE paid_at BETWEEN $1 AND $2 ${clientFilter}) collected,
       (SELECT coalesce(sum(recurring_revenue),0) FROM projects WHERE status='ACTIVE' ${user.role === "CLIENT" ? "AND client_id = $3" : ""}) mrr`,
    params,
  );
  const t = totals.rows[0];
  const num = (v: any) => Math.round((Number(v) || 0) * 100) / 100;
  return {
    from,
    to,
    billed: num(t.billed),
    collected: num(t.collected),
    collectionRate: Number(t.billed) > 0 ? Math.round((Number(t.collected) / Number(t.billed)) * 1000) / 10 : null,
    mrr: num(t.mrr),
    arr: num(Number(t.mrr) * 12),
    monthly: monthly.rows.map((r) => ({ month: r.month, billed: num(r.billed), collected: num(r.collected) })),
  };
}

/** Renewal watch: what renews in 7/30/60/90 days and the revenue at stake. */
export async function renewalWatch(user: SessionUser) {
  const s = clientScope(user, "a.client_id");
  const num = (v: any) => Math.round((Number(v) || 0) * 100) / 100;

  const windows = await query<any>(
    `SELECT
       count(*) FILTER (WHERE d <= 7)::int  n7,   coalesce(sum(price) FILTER (WHERE d <= 7),0)  rev7,
       count(*) FILTER (WHERE d <= 30)::int n30,  coalesce(sum(price) FILTER (WHERE d <= 30),0) rev30,
       count(*) FILTER (WHERE d <= 60)::int n60,  coalesce(sum(price) FILTER (WHERE d <= 60),0) rev60,
       count(*) FILTER (WHERE d <= 90)::int n90,  coalesce(sum(price) FILTER (WHERE d <= 90),0) rev90,
       count(*) FILTER (WHERE d < 0)::int   overdue
     FROM (
       SELECT (a.renewal_date - CURRENT_DATE)::int d, a.recurring_price price
         FROM assets a ${s.where ? s.where + " AND" : "WHERE"} a.status='ACTIVE' AND a.renewal_date IS NOT NULL
          AND a.renewal_date <= CURRENT_DATE + 90
     ) x`,
    s.params,
  );

  const list = await query<any>(
    `SELECT a.id, a.name, a.type, a.provider, a.renewal_date, a.recurring_cost, a.recurring_price,
            a.auto_invoice, c.name client_name, (a.renewal_date - CURRENT_DATE)::int days
       FROM assets a JOIN clients c ON c.id=a.client_id
      ${s.where ? s.where + " AND" : "WHERE"} a.status='ACTIVE' AND a.renewal_date IS NOT NULL
        AND a.renewal_date <= CURRENT_DATE + 90
      ORDER BY a.renewal_date
      LIMIT 100`,
    s.params,
  );

  const w = windows.rows[0] ?? {};
  return {
    windows: {
      "7": { count: Number(w.n7 || 0), revenue: num(w.rev7) },
      "30": { count: Number(w.n30 || 0), revenue: num(w.rev30) },
      "60": { count: Number(w.n60 || 0), revenue: num(w.rev60) },
      "90": { count: Number(w.n90 || 0), revenue: num(w.rev90) },
    },
    overdue: Number(w.overdue || 0),
    revenueAtRisk: num(w.rev30),
    items: list.rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      provider: r.provider,
      client: r.client_name,
      renewalDate: r.renewal_date,
      days: r.days,
      cost: num(r.recurring_cost),
      price: num(r.recurring_price),
      autoInvoice: r.auto_invoice,
    })),
  };
}

export function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
