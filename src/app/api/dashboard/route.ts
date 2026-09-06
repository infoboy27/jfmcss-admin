import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const scoped = user.role === "CLIENT" && user.clientId ? user.clientId : null;
    // `$1` is applied to every client-scoped aggregate; when null the filter is a no-op.
    const p = [scoped];
    const clientClause = "($1::uuid IS NULL OR client_id = $1::uuid)";

    const [clients, projects, invoices, tickets, assets, pipeline, activity] = await Promise.all([
      query<{ count: string }>(
        `SELECT count(*)::text count FROM clients WHERE status='ACTIVE' AND ($1::uuid IS NULL OR id = $1::uuid)`,
        p,
      ),
      query<{ active: string; recurring: string }>(
        `SELECT count(*) FILTER (WHERE status='ACTIVE')::text active,
                coalesce(sum(recurring_revenue) FILTER (WHERE status='ACTIVE'),0)::text recurring
           FROM projects WHERE ${clientClause}`,
        p,
      ),
      query<{ month_total: string; outstanding: string; overdue: string }>(
        `SELECT coalesce(sum(total) FILTER (WHERE date_trunc('month',issue_date)=date_trunc('month',CURRENT_DATE)),0)::text month_total,
                coalesce(sum(total-paid_amount) FILTER (WHERE status IN ('ISSUED','PARTIAL','OVERDUE')),0)::text outstanding,
                coalesce(sum(total-paid_amount) FILTER (WHERE due_date<CURRENT_DATE AND status IN ('ISSUED','PARTIAL','OVERDUE')),0)::text overdue
           FROM invoices WHERE ${clientClause}`,
        p,
      ),
      query<{ open: string; urgent: string; sla_risk: string }>(
        `SELECT count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED'))::text open,
                count(*) FILTER (WHERE priority='URGENT' AND status NOT IN ('RESOLVED','CLOSED'))::text urgent,
                count(*) FILTER (WHERE sla_due_at<now()+interval '2 hours' AND status NOT IN ('RESOLVED','CLOSED'))::text sla_risk
           FROM tickets WHERE ${clientClause}`,
        p,
      ),
      query<{ renewals: string }>(
        `SELECT count(*) FILTER (WHERE renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30)::text renewals
           FROM assets WHERE ${clientClause}`,
        p,
      ),
      query<{ weighted: string; open: string }>(
        `SELECT coalesce(sum(amount*probability/100.0) FILTER (WHERE stage NOT IN ('WON','LOST')),0)::text weighted,
                count(*) FILTER (WHERE stage NOT IN ('WON','LOST'))::text open
           FROM opportunities WHERE ${clientClause}`,
        p,
      ),
      scoped
        ? Promise.resolve({ rows: [] as Record<string, unknown>[] })
        : query(`SELECT id,action,entity_type,entity_id,created_at FROM audit_log ORDER BY created_at DESC LIMIT 12`),
    ]);

    return NextResponse.json({
      clients: Number(clients.rows[0]?.count || 0),
      projects: { active: Number(projects.rows[0]?.active || 0), mrr: Number(projects.rows[0]?.recurring || 0) },
      billing: Object.fromEntries(Object.entries(invoices.rows[0] || {}).map(([k, v]) => [k, Number(v || 0)])),
      support: Object.fromEntries(Object.entries(tickets.rows[0] || {}).map(([k, v]) => [k, Number(v || 0)])),
      renewals: Number(assets.rows[0]?.renewals || 0),
      pipeline: { weighted: Number(pipeline.rows[0]?.weighted || 0), open: Number(pipeline.rows[0]?.open || 0) },
      activity: activity.rows,
    });
  } catch (error) {
    return apiError(error);
  }
}
