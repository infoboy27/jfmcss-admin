import crypto from "node:crypto";
import { requireUser, type SessionUser } from "@/lib/auth";
import { query, tx } from "@/lib/db";
import { apiError, ok, fail, optionalText, ApiError } from "@/lib/http";
import { calculateInvoice } from "@/lib/billing";
import { audit } from "@/lib/audit";
import { assertClientAccess } from "@/lib/scope";
import { proposalUpdateSchema, proposalActionSchema } from "@/lib/schema";
import { sendEmail } from "@/lib/notifications";
import { convertProposal } from "@/lib/proposals";

type ProposalRow = Record<string, unknown> & {
  id: string;
  number: string;
  client_id: string;
  opportunity_id: string | null;
  project_id: string | null;
  title: string;
  status: string;
  currency: string;
  total: string;
  public_token: string | null;
};

async function loadProposal(id: string) {
  const proposal = (await query<ProposalRow>(`SELECT * FROM proposals WHERE id=$1`, [id])).rows[0];
  if (!proposal) throw new ApiError("NOT_FOUND", "Propuesta no encontrada", 404);
  return proposal;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const proposal = await loadProposal(id);
    assertClientAccess(user, proposal.client_id);
    const [items, milestones, client] = await Promise.all([
      query(`SELECT * FROM proposal_items WHERE proposal_id=$1 ORDER BY position`, [id]),
      query(`SELECT * FROM proposal_milestones WHERE proposal_id=$1 ORDER BY position`, [id]),
      query(`SELECT name,legal_name,tax_id,email FROM clients WHERE id=$1`, [proposal.client_id]),
    ]);
    return ok({ proposal, items: items.rows, milestones: milestones.rows, client: client.rows[0] });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN", "PM", "FINANCE"]);
    const { id } = await params;
    const before = await loadProposal(id);
    const body = await request.json().catch(() => ({}));

    if (typeof body.action === "string") {
      return await runAction(user, before, request, body);
    }

    if (before.status !== "DRAFT") {
      return fail("INVALID_STATE", "Solo se puede editar una propuesta en borrador", 409);
    }
    const b = proposalUpdateSchema.parse(body);
    const totals = b.items ? calculateInvoice(b.items, b.discount ?? 0) : null;

    const updated = await tx(async (c) => {
      const { rows } = await c.query<ProposalRow>(
        `UPDATE proposals SET
           title=coalesce($2,title), summary=$3, currency=coalesce($4,currency),
           valid_until=$5, payment_terms=$6, terms=$7, notes=$8, opportunity_id=coalesce($9,opportunity_id),
           subtotal=coalesce($10,subtotal), tax=coalesce($11,tax), discount=coalesce($12,discount), total=coalesce($13,total),
           updated_at=now()
         WHERE id=$1 RETURNING *`,
        [
          id,
          optionalText(b.title, 250),
          optionalText(b.summary, 4000),
          b.currency ?? null,
          b.validUntil ?? null,
          optionalText(b.paymentTerms, 500),
          optionalText(b.terms, 8000),
          optionalText(b.notes, 4000),
          b.opportunityId ?? null,
          totals?.subtotal ?? null,
          totals?.tax ?? null,
          totals?.discount ?? null,
          totals?.total ?? null,
        ],
      );
      if (totals) {
        await c.query(`DELETE FROM proposal_items WHERE proposal_id=$1`, [id]);
        for (const item of totals.items) {
          await c.query(
            `INSERT INTO proposal_items
               (proposal_id,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total,position)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [id, item.description, item.quantity, item.unitPrice, item.taxRate, item.lineSubtotal, item.lineTax, item.lineTotal, item.position],
          );
        }
      }
      if (b.milestones) {
        await c.query(`DELETE FROM proposal_milestones WHERE proposal_id=$1`, [id]);
        const total = totals?.total ?? Number(before.total);
        for (let i = 0; i < b.milestones.length; i++) {
          const m = b.milestones[i];
          const amount = m.amount ?? (m.percentage != null ? Math.round(((total * m.percentage) / 100) * 100) / 100 : null);
          await c.query(
            `INSERT INTO proposal_milestones(proposal_id,label,percentage,amount,position) VALUES ($1,$2,$3,$4,$5)`,
            [id, m.label, m.percentage ?? null, amount, i],
          );
        }
      }
      return rows[0];
    });

    await audit(user.id, "UPDATE", "PROPOSAL", id, updated, before);
    return ok({ proposal: updated });
  } catch (e) {
    return apiError(e);
  }
}

async function runAction(user: SessionUser, before: ProposalRow, request: Request, rawBody: unknown) {
  const b = proposalActionSchema.parse(rawBody);

  if (b.action === "SEND") {
    if (!["DRAFT", "SENT"].includes(before.status)) {
      return fail("INVALID_STATE", "La propuesta ya fue decidida", 409);
    }
    const token = before.public_token ?? crypto.randomBytes(24).toString("base64url");
    const { rows } = await query<ProposalRow>(
      `UPDATE proposals SET status='SENT', public_token=$2, sent_at=coalesce(sent_at,now()), updated_at=now()
       WHERE id=$1 RETURNING *`,
      [before.id, token],
    );
    const client = (await query<{ name: string; email: string | null }>(`SELECT name,email FROM clients WHERE id=$1`, [before.client_id])).rows[0];
    const link = `${process.env.APP_URL || ""}/p/${token}`;
    if (client?.email) {
      await sendEmail(
        client.email,
        `Propuesta ${before.number} · JFMCSS`,
        `<p>Hola ${client.name},</p><p>Puedes revisar y responder la propuesta <strong>${before.title}</strong> en el siguiente enlace seguro:</p><p><a href="${link}">${link}</a></p>`,
        before.client_id,
      );
    }
    await audit(user.id, "SEND", "PROPOSAL", before.id, { link });
    return ok({ proposal: rows[0], link });
  }

  if (b.action === "EXPIRE") {
    const { rows } = await query<ProposalRow>(`UPDATE proposals SET status='EXPIRED', updated_at=now() WHERE id=$1 RETURNING *`, [before.id]);
    await audit(user.id, "EXPIRE", "PROPOSAL", before.id);
    return ok({ proposal: rows[0] });
  }

  if (b.action === "REJECT") {
    const { rows } = await query<ProposalRow>(
      `UPDATE proposals SET status='REJECTED', decided_at=now(), decided_note=$2, updated_at=now() WHERE id=$1 RETURNING *`,
      [before.id, optionalText(b.note, 2000)],
    );
    await audit(user.id, "REJECT", "PROPOSAL", before.id);
    return ok({ proposal: rows[0] });
  }

  // ACCEPT / CONVERT — the money path.
  if (["ACCEPTED", "REJECTED", "EXPIRED"].includes(before.status) && b.action === "ACCEPT") {
    return fail("INVALID_STATE", "La propuesta ya fue decidida", 409);
  }
  const outcome = await convertProposal(before.id, user.id, {
    note: b.note ?? null,
    createInitialInvoice: b.createInitialInvoice ?? false,
  });
  await audit(user.id, "CONVERT", "PROPOSAL", before.id, outcome);
  return ok(outcome);
}
