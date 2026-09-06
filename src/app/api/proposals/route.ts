import { requireUser } from "@/lib/auth";
import { nextHumanNumber, query, tx } from "@/lib/db";
import { apiError, ok, optionalText } from "@/lib/http";
import { calculateInvoice } from "@/lib/billing";
import { audit } from "@/lib/audit";
import { parseBody, proposalCreateSchema } from "@/lib/schema";
import { clientScope } from "@/lib/scope";

export async function GET() {
  try {
    const user = await requireUser();
    const scope = clientScope(user, "p.client_id");
    const { rows } = await query(
      `SELECT p.*, c.name client_name, o.title opportunity_title, pr.name project_name
         FROM proposals p
         JOIN clients c ON c.id = p.client_id
         LEFT JOIN opportunities o ON o.id = p.opportunity_id
         LEFT JOIN projects pr ON pr.id = p.project_id
         ${scope.where}
        ORDER BY p.created_at DESC
        LIMIT 250`,
      scope.params,
    );
    return ok({ proposals: rows });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN", "PM", "FINANCE"]);
    const b = await parseBody(request, proposalCreateSchema);
    const totals = calculateInvoice(b.items, b.discount);

    const proposal = await tx(async (c) => {
      const number = await nextHumanNumber(c, "PRO", "proposals");
      const { rows } = await c.query<Record<string, unknown> & { id: string }>(
        `INSERT INTO proposals
           (number,client_id,opportunity_id,title,summary,currency,subtotal,tax,discount,total,
            valid_until,payment_terms,terms,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
          number,
          b.clientId,
          b.opportunityId ?? null,
          b.title,
          optionalText(b.summary, 4000),
          b.currency ?? "DOP",
          totals.subtotal,
          totals.tax,
          totals.discount,
          totals.total,
          b.validUntil ?? null,
          optionalText(b.paymentTerms, 500),
          optionalText(b.terms, 8000),
          optionalText(b.notes, 4000),
          user.id,
        ],
      );
      const proposalId = rows[0].id;
      for (const item of totals.items) {
        await c.query(
          `INSERT INTO proposal_items
             (proposal_id,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total,position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [proposalId, item.description, item.quantity, item.unitPrice, item.taxRate, item.lineSubtotal, item.lineTax, item.lineTotal, item.position],
        );
      }
      const milestones = b.milestones ?? [];
      for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
        const amount =
          m.amount ??
          (m.percentage != null ? Math.round(((totals.total * m.percentage) / 100) * 100) / 100 : null);
        await c.query(
          `INSERT INTO proposal_milestones(proposal_id,label,percentage,amount,position) VALUES ($1,$2,$3,$4,$5)`,
          [proposalId, m.label, m.percentage ?? null, amount, i],
        );
      }
      return rows[0];
    });

    await audit(user.id, "CREATE", "PROPOSAL", proposal.id, proposal);
    return ok({ proposal }, 201);
  } catch (e) {
    return apiError(e);
  }
}
