import { tx, query } from "./db";
import { calculateInvoice } from "./billing";
import { allocateFiscalNumber } from "./fiscal";
import { sendEmail } from "./notifications";
import { audit } from "./audit";
import { log } from "./log";

const CYCLE_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
  CUSTOM: 1,
};

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

type ServiceRow = {
  id: string;
  client_id: string;
  name: string;
  service_description: string | null;
  recurring_price: string;
  billing_cycle: string;
  fiscal_type: string;
  next_invoice_date: string;
  client_email: string | null;
  client_name: string;
  payment_terms_days: number;
};

export type RecurringResult = { due: number; invoiced: number; skipped: number; errors: number };

/**
 * Generates one issued invoice per due recurring service and advances its
 * schedule. Idempotent: the invoice carries `(asset_id, period_start)` which is
 * uniquely indexed, so a second run within the same period inserts nothing and
 * still advances nothing it shouldn't (the advance only happens on a fresh row).
 */
export async function runRecurringBilling(actorId: string | null = null): Promise<RecurringResult> {
  const result: RecurringResult = { due: 0, invoiced: 0, skipped: 0, errors: 0 };

  const { rows: services } = await query<ServiceRow>(
    `SELECT a.id,a.client_id,a.name,a.service_description,a.recurring_price,a.billing_cycle,a.fiscal_type,
            a.next_invoice_date::text next_invoice_date,
            c.email client_email, c.name client_name, c.payment_terms_days
       FROM assets a JOIN clients c ON c.id = a.client_id
      WHERE a.auto_invoice = true
        AND a.status = 'ACTIVE'
        AND a.next_invoice_date IS NOT NULL
        AND a.next_invoice_date <= CURRENT_DATE
        AND a.recurring_price > 0
      ORDER BY a.next_invoice_date`,
  );
  result.due = services.length;

  for (const svc of services) {
    const months = CYCLE_MONTHS[svc.billing_cycle] ?? 1;
    const periodStart = svc.next_invoice_date;
    const periodEnd = addMonths(periodStart, months);
    const price = Number(svc.recurring_price);
    const description =
      svc.service_description ||
      `${svc.name} · ${svc.billing_cycle.toLowerCase()} (${periodStart} → ${periodEnd})`;

    try {
      const outcome = await tx(async (c) => {
        // Re-check + lock the row so two runners can't both advance it.
        const locked = (
          await c.query<{ next_invoice_date: string }>(
            `SELECT next_invoice_date::text FROM assets WHERE id=$1 FOR UPDATE`,
            [svc.id],
          )
        ).rows[0];
        if (!locked || locked.next_invoice_date !== periodStart) return "skip" as const;

        const totals = calculateInvoice([{ description, quantity: 1, unitPrice: price, taxRate: 18 }], 0);
        const item = totals.items[0];

        await c.query(`SELECT pg_advisory_xact_lock(hashtext('jfmcss-invoice-number'))`);
        const year = new Date().getFullYear();
        const last = (
          await c.query<{ number: string }>(
            `SELECT number FROM invoices WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`,
            [`FAC-${year}-%`],
          )
        ).rows[0];
        const nextSeq = (Number(last?.number?.split("-").at(-1)) || 0) + 1;
        const number = `FAC-${year}-${String(nextSeq).padStart(5, "0")}`;
        const ncf = await allocateFiscalNumber(c, svc.fiscal_type || "E31");

        const issueDate = new Date().toISOString().slice(0, 10);
        const dueDate = addMonths(issueDate, 0);
        const due = new Date(dueDate + "T12:00:00Z");
        due.setUTCDate(due.getUTCDate() + Number(svc.payment_terms_days ?? 30));

        const ins = await c.query<{ id: string; number: string }>(
          `INSERT INTO invoices
             (client_id,asset_id,number,fiscal_type,ncf,status,currency,issue_date,due_date,
              period_start,period_end,subtotal,tax,discount,total,notes,created_by)
           VALUES ($1,$2,$3,$4,$5,'ISSUED','DOP',$6,$7,$8,$9,$10,$11,0,$12,$13,$14)
           ON CONFLICT (asset_id, period_start) WHERE asset_id IS NOT NULL DO NOTHING
           RETURNING id,number`,
          [
            svc.client_id, svc.id, number, svc.fiscal_type || "E31", ncf,
            issueDate, due.toISOString().slice(0, 10), periodStart, periodEnd,
            totals.subtotal, totals.tax, totals.total,
            `Servicio recurrente · ${svc.name}`, actorId,
          ],
        );
        if (ins.rows.length === 0) return "skip" as const; // already billed this period

        await c.query(
          `INSERT INTO invoice_items
             (invoice_id,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total,position)
           VALUES ($1,$2,1,$3,18,$4,$5,$6,0)`,
          [ins.rows[0].id, description, item.unitPrice, item.lineSubtotal, item.lineTax, item.lineTotal],
        );
        await c.query(
          `UPDATE assets SET next_invoice_date=$2, billed_through=$3, updated_at=now() WHERE id=$1`,
          [svc.id, periodEnd, periodEnd],
        );
        return { invoice: ins.rows[0], total: totals.total };
      });

      if (outcome === "skip") {
        result.skipped++;
        continue;
      }
      result.invoiced++;
      await audit(actorId, "RECURRING_INVOICE", "INVOICE", outcome.invoice.id, {
        asset: svc.id,
        number: outcome.invoice.number,
        period: [periodStart, periodEnd],
      });
      if (svc.client_email) {
        await sendEmail(
          svc.client_email,
          `Factura ${outcome.invoice.number} · ${svc.name} · JFMCSS`,
          `<p>Hola ${svc.client_name},</p><p>Hemos emitido la factura <strong>${outcome.invoice.number}</strong> por el servicio <strong>${svc.name}</strong> (${periodStart} → ${periodEnd}) por RD$${outcome.total.toLocaleString(
            "en-US",
            { minimumFractionDigits: 2 },
          )}.</p>`,
          svc.client_id,
        );
      }
    } catch (err) {
      result.errors++;
      log.error("recurring billing failed for asset", err, { assetId: svc.id });
    }
  }

  return result;
}
