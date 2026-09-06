import { query } from "@/lib/db";
import { notifyInAppOnce, sendEmail } from "@/lib/notifications";
import { ok, apiError } from "@/lib/http";
import { assertCronAuth } from "@/lib/cron";

export const dynamic = "force-dynamic";

type InvoiceRow = { id: string; number: string; client_id: string; total: string; paid_amount: string; name?: string; email?: string | null };
type AssetRow = { id: string; name: string; type: string; renewal_date: string; client_id: string; client_name: string };
type TicketRow = { id: string; number: string; client_id: string; subject: string };

const rd = (n: number) => `RD$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/**
 * Daily business cron. Idempotent: the OVERDUE status write is a no-op on
 * repeat, and every reminder goes through `notifyInAppOnce` so running twice a
 * day doesn't double-notify. Emails are queued to the outbox, not sent inline.
 */
export async function POST(request: Request) {
  try {
    assertCronAuth(request);

    // Housekeeping: drop expired session rows so the table doesn't grow forever.
    const pruned = await query(`DELETE FROM sessions WHERE expires_at < now()-interval '1 day'`);

    const team = (
      await query<{ id: string; email: string }>(
        `SELECT id,email FROM users WHERE active=true AND role IN ('SUPER_ADMIN','ADMIN','FINANCE','SUPPORT')`,
      )
    ).rows;

    const overdue = (
      await query<InvoiceRow>(
        `UPDATE invoices SET status='OVERDUE',updated_at=now()
          WHERE due_date<CURRENT_DATE AND status IN ('ISSUED','PARTIAL')
          RETURNING id,number,client_id,total,paid_amount`,
      )
    ).rows;
    const dueSoon = (
      await query<InvoiceRow>(
        `SELECT i.id,i.number,i.client_id,i.total,i.paid_amount,c.name,c.email
           FROM invoices i JOIN clients c ON c.id=i.client_id
          WHERE i.status IN ('ISSUED','PARTIAL') AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+3`,
      )
    ).rows;
    const renewals = (
      await query<AssetRow>(
        `SELECT a.id,a.name,a.type,a.renewal_date,a.client_id,c.name client_name
           FROM assets a JOIN clients c ON c.id=a.client_id
          WHERE a.status='ACTIVE' AND a.renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30`,
      )
    ).rows;
    const sla = (
      await query<TicketRow>(
        `SELECT id,number,client_id,subject FROM tickets
          WHERE status NOT IN ('RESOLVED','CLOSED') AND sla_due_at<now()+interval '2 hours'`,
      )
    ).rows;

    for (const inv of overdue) {
      const balance = rd(Number(inv.total) - Number(inv.paid_amount));
      for (const u of team) {
        await notifyInAppOnce(u.id, `overdue:${inv.id}`, `Factura vencida ${inv.number}`, `Balance ${balance}`, inv.client_id);
      }
    }
    for (const inv of dueSoon) {
      if (inv.email) {
        await sendEmail(
          inv.email,
          `Recordatorio de factura ${inv.number}`,
          `<p>Hola ${inv.name ?? ""},</p><p>Tu factura ${inv.number} vence próximamente. Balance: <strong>${rd(
            Number(inv.total) - Number(inv.paid_amount),
          )}</strong>.</p>`,
          inv.client_id,
        );
      }
    }
    for (const a of renewals) {
      for (const u of team) {
        await notifyInAppOnce(
          u.id,
          `renewal:${a.id}`,
          `Renovación próxima: ${a.name}`,
          `${a.client_name} · ${a.type} · ${String(a.renewal_date).slice(0, 10)}`,
          a.client_id,
        );
      }
    }
    for (const t of sla) {
      for (const u of team) {
        await notifyInAppOnce(u.id, `sla:${t.id}`, `SLA en riesgo ${t.number}`, t.subject, t.client_id);
      }
    }

    return ok({
      sessionsPruned: pruned.rowCount ?? 0,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      renewals: renewals.length,
      slaRisk: sla.length,
    });
  } catch (e) {
    return apiError(e);
  }
}
