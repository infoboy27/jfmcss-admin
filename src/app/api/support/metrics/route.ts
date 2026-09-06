import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, ok } from "@/lib/http";
import { clientScope } from "@/lib/scope";
import { csatSummary } from "@/lib/csat";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET() {
  try {
    const user = await requireUser();
    const scope = clientScope(user, "client_id");

    const [counts, perf, unbilled, csat] = await Promise.all([
      query<any>(
        `SELECT
           count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED'))::int open,
           count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED') AND priority='URGENT')::int urgent,
           count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED') AND resolution_due_at < now() + interval '2 hours')::int sla_risk,
           count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED') AND resolution_due_at < now())::int overdue,
           count(*) FILTER (WHERE status = 'WAITING_CLIENT')::int waiting_client
         FROM tickets ${scope.where}`,
        scope.params,
      ),
      query<any>(
        `SELECT
           count(*) FILTER (WHERE first_response_at IS NOT NULL)::int responded,
           count(*) FILTER (WHERE first_response_at IS NOT NULL AND NOT first_response_breached)::int fr_ontime,
           count(*) FILTER (WHERE resolved_at IS NOT NULL)::int resolved,
           count(*) FILTER (WHERE resolved_at IS NOT NULL AND NOT resolution_breached)::int res_ontime,
           avg(EXTRACT(EPOCH FROM (first_response_at - created_at))) FILTER (WHERE first_response_at IS NOT NULL) avg_fr_seconds,
           avg(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved_at IS NOT NULL) avg_res_seconds
         FROM tickets
         WHERE created_at > now() - interval '90 days' ${scope.where ? "AND " + scope.where.replace("WHERE ", "") : ""}`,
        scope.params,
      ),
      user.role === "CLIENT"
        ? Promise.resolve({ rows: [{ minutes: 0 }] })
        : query<any>(
            `SELECT coalesce(sum(minutes),0)::int minutes
               FROM ticket_time_entries WHERE billable=true AND invoice_id IS NULL`,
          ),
      csatSummary(user),
    ]);

    const pf = perf.rows[0];
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
    return ok({
      ...counts.rows[0],
      firstResponseCompliance: pct(pf.fr_ontime, pf.responded),
      resolutionCompliance: pct(pf.res_ontime, pf.resolved),
      avgFirstResponseMinutes: pf.avg_fr_seconds ? Math.round(pf.avg_fr_seconds / 60) : null,
      avgResolutionMinutes: pf.avg_res_seconds ? Math.round(pf.avg_res_seconds / 60) : null,
      unbilledMinutes: Number(unbilled.rows[0]?.minutes || 0),
      csat,
    });
  } catch (e) {
    return apiError(e);
  }
}
