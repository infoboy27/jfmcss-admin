import { tx, query } from "./db";
import { ApiError } from "./errors";
import { calculateInvoice } from "./billing";
import { allocateFiscalNumber } from "./fiscal";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type SupportInvoiceOpts = {
  hourlyRate?: number;
  fiscalType?: "E31" | "E32" | "B01" | "B02";
  issue?: boolean;
  perTicket?: boolean;
};

export type SupportInvoiceOutcome = {
  invoice: any;
  billedEntries: number;
  tickets: number;
  minutes: number;
  client: { email: string | null; name: string } | null;
};

/**
 * Rolls a client's unbilled billable support time into one invoice and stamps
 * the time entries with `invoice_id` so the same minutes can never be billed
 * twice. Single transaction; entries are `FOR UPDATE`-locked.
 */
export async function invoiceSupportTime(
  clientId: string,
  actorId: string | null,
  opts: SupportInvoiceOpts,
): Promise<SupportInvoiceOutcome> {
  const cfg = (await query<{ value: any }>(`SELECT value FROM settings WHERE key='support'`)).rows[0]?.value ?? {};
  const rate = opts.hourlyRate || Number(cfg.hourlyRate) || 2500;
  const fiscalType = opts.fiscalType || "E31";
  const issue = opts.issue ?? true;

  return tx(async (c) => {
    const entries = (
      await c.query<any>(
        `SELECT e.id, e.minutes, t.number ticket_number, t.subject
           FROM ticket_time_entries e JOIN tickets t ON t.id = e.ticket_id
          WHERE t.client_id = $1 AND e.billable = true AND e.invoice_id IS NULL
          ORDER BY t.number
          FOR UPDATE OF e`,
        [clientId],
      )
    ).rows;
    if (entries.length === 0) throw new ApiError("NOTHING_TO_BILL", "No hay tiempo de soporte sin facturar para este cliente", 409);

    const byTicket = new Map<string, { minutes: number; subject: string }>();
    for (const e of entries) {
      const cur = byTicket.get(e.ticket_number) ?? { minutes: 0, subject: e.subject };
      cur.minutes += e.minutes;
      byTicket.set(e.ticket_number, cur);
    }
    const totalMinutes = entries.reduce((s: number, e: any) => s + e.minutes, 0);
    const hrs = (min: number) => Math.round((min / 60) * 100) / 100;

    const items =
      opts.perTicket !== false
        ? [...byTicket].map(([num, v]) => ({
            description: `Soporte ${num} — ${v.subject}`.slice(0, 250),
            quantity: hrs(v.minutes),
            unitPrice: rate,
            taxRate: 18,
          }))
        : [
            {
              description: `Soporte técnico (${hrs(totalMinutes)} h · ${byTicket.size} tickets)`,
              quantity: hrs(totalMinutes),
              unitPrice: rate,
              taxRate: 18,
            },
          ];
    const totals = calculateInvoice(items, 0);

    await c.query(`SELECT pg_advisory_xact_lock(hashtext('jfmcss-invoice-number'))`);
    const year = new Date().getFullYear();
    const last = (
      await c.query<{ number: string }>(`SELECT number FROM invoices WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`, [`FAC-${year}-%`])
    ).rows[0];
    const nextSeq = (Number(last?.number?.split("-").at(-1)) || 0) + 1;
    const number = `FAC-${year}-${String(nextSeq).padStart(5, "0")}`;
    const ncf = issue ? await allocateFiscalNumber(c, fiscalType) : null;

    const issueDate = new Date().toISOString().slice(0, 10);
    const cr =
      (await c.query<{ payment_terms_days: number; email: string | null; name: string }>(
        `SELECT payment_terms_days,email,name FROM clients WHERE id=$1`,
        [clientId],
      )).rows[0] ?? null;
    const due = new Date(issueDate + "T12:00:00Z");
    due.setUTCDate(due.getUTCDate() + Number(cr?.payment_terms_days ?? 30));

    const inv = (
      await c.query<any>(
        `INSERT INTO invoices
           (client_id,number,fiscal_type,ncf,status,source,currency,issue_date,due_date,subtotal,tax,discount,total,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,'SUPPORT','DOP',$6,$7,$8,$9,0,$10,$11,$12)
         RETURNING *`,
        [
          clientId, number, fiscalType, ncf, issue ? "ISSUED" : "DRAFT",
          issueDate, due.toISOString().slice(0, 10),
          totals.subtotal, totals.tax, totals.total,
          `Soporte facturable · ${byTicket.size} ticket(s)`, actorId,
        ],
      )
    ).rows[0];
    for (const item of totals.items) {
      await c.query(
        `INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total,position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [inv.id, item.description, item.quantity, item.unitPrice, item.taxRate, item.lineSubtotal, item.lineTax, item.lineTotal, item.position],
      );
    }
    await c.query(`UPDATE ticket_time_entries SET invoice_id=$2 WHERE id = ANY($1)`, [entries.map((e: any) => e.id), inv.id]);

    return { invoice: inv, billedEntries: entries.length, tickets: byTicket.size, minutes: totalMinutes, client: cr };
  });
}
