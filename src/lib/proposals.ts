import type { PoolClient } from "pg";
import { tx, nextHumanNumber } from "./db";
import { ApiError } from "./errors";
import { calculateInvoice } from "./billing";
import { allocateFiscalNumber } from "./fiscal";

type ProposalRow = {
  id: string;
  number: string;
  client_id: string;
  opportunity_id: string | null;
  project_id: string | null;
  title: string;
  summary: string | null;
  status: string;
  currency: string;
  total: string;
};

export type ConversionOutcome = {
  proposal: string;
  project: { id: string; code: string; name: string };
  invoice: { id: string; number: string } | null;
  lineCount: number;
};

/** Standard DR ITBIS rate — used to split a tax-inclusive milestone amount. */
const DEFAULT_TAX_RATE = 18;

async function nextInvoiceNumber(c: PoolClient): Promise<string> {
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('jfmcss-invoice-number'))`);
  const year = new Date().getFullYear();
  const last = (
    await c.query<{ number: string }>(
      `SELECT number FROM invoices WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`,
      [`FAC-${year}-%`],
    )
  ).rows[0];
  const nextSeq = (Number(last?.number?.split("-").at(-1)) || 0) + 1;
  return `FAC-${year}-${String(nextSeq).padStart(5, "0")}`;
}

/**
 * Accept a proposal and materialise it in one transaction: opportunity → WON,
 * a new project created and linked, and — optionally — an initial invoice from
 * the first payment milestone (or the full amount if there are none).
 *
 * A milestone amount is treated as tax-inclusive (it's a slice of the
 * proposal's tax-inclusive total), so the invoice splits it back into
 * subtotal + ITBIS at the standard rate.
 */
export function convertProposal(
  proposalId: string,
  actorId: string | null,
  opts: { note: string | null; createInitialInvoice: boolean },
): Promise<ConversionOutcome> {
  return tx(async (c) => {
    const p = (await c.query<ProposalRow>(`SELECT * FROM proposals WHERE id=$1 FOR UPDATE`, [proposalId])).rows[0];
    if (!p) throw new ApiError("NOT_FOUND", "Propuesta no encontrada", 404);
    if (p.project_id) throw new ApiError("ALREADY_CONVERTED", "La propuesta ya fue convertida", 409);
    if (["REJECTED", "EXPIRED"].includes(p.status)) {
      throw new ApiError("INVALID_STATE", "La propuesta fue rechazada o expiró", 409);
    }

    const lineCount = Number(
      (await c.query<{ n: string }>(`SELECT count(*)::text n FROM proposal_items WHERE proposal_id=$1`, [proposalId])).rows[0]?.n ?? 0,
    );

    const projectCode = await nextHumanNumber(c, "PRJ", "projects");
    const project = (
      await c.query<{ id: string; code: string; name: string }>(
        `INSERT INTO projects(client_id,code,name,description,status,budget,owner_id,recurring_revenue)
         VALUES ($1,$2,$3,$4,'PLANNING',$5,$6,0) RETURNING id,code,name`,
        [p.client_id, projectCode, p.title, p.summary ?? null, Number(p.total), actorId],
      )
    ).rows[0];

    await c.query(
      `UPDATE proposals
          SET status='ACCEPTED', project_id=$2,
              decided_at=coalesce(decided_at,now()),
              decided_note=coalesce($3,decided_note), updated_at=now()
        WHERE id=$1`,
      [proposalId, project.id, opts.note],
    );
    if (p.opportunity_id) {
      await c.query(`UPDATE opportunities SET stage='WON', updated_at=now() WHERE id=$1`, [p.opportunity_id]);
    }

    let invoice: ConversionOutcome["invoice"] = null;
    if (opts.createInitialInvoice) {
      const milestone = (
        await c.query<{ id: string; label: string; amount: string | null }>(
          `SELECT id,label,amount FROM proposal_milestones WHERE proposal_id=$1 ORDER BY position LIMIT 1`,
          [proposalId],
        )
      ).rows[0];
      const gross = milestone?.amount != null ? Number(milestone.amount) : Number(p.total);
      const description = milestone ? `${p.title} — ${milestone.label}` : `${p.title} (Propuesta ${p.number})`;

      const line = calculateInvoice(
        [{ description, quantity: 1, unitPrice: gross / (1 + DEFAULT_TAX_RATE / 100), taxRate: DEFAULT_TAX_RATE }],
        0,
      );
      const item = line.items[0];

      const number = await nextInvoiceNumber(c);
      const ncf = await allocateFiscalNumber(c, "E31");
      const inv = (
        await c.query<{ id: string; number: string }>(
          `INSERT INTO invoices
             (client_id,project_id,proposal_id,number,fiscal_type,ncf,status,currency,subtotal,tax,discount,total,notes,created_by)
           VALUES ($1,$2,$3,$4,'E31',$5,'ISSUED',$6,$7,$8,0,$9,$10,$11)
           RETURNING id,number`,
          [
            p.client_id, project.id, proposalId, number, ncf, p.currency,
            line.subtotal, line.tax, line.total,
            `Generada desde la propuesta ${p.number}`, actorId,
          ],
        )
      ).rows[0];
      await c.query(
        `INSERT INTO invoice_items
           (invoice_id,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total,position)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,0)`,
        [inv.id, description, item.unitPrice, item.taxRate, item.lineSubtotal, item.lineTax, item.lineTotal],
      );
      if (milestone) await c.query(`UPDATE proposal_milestones SET invoice_id=$2 WHERE id=$1`, [milestone.id, inv.id]);
      invoice = inv;
    }

    return { proposal: proposalId, project, invoice, lineCount };
  });
}
