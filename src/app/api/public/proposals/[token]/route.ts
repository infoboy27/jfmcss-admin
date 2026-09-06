import { query } from "@/lib/db";
import { apiError, ok, fail } from "@/lib/http";
import { parseBody, publicDecisionSchema } from "@/lib/schema";
import { rateLimit } from "@/lib/ratelimit";
import { convertProposal } from "@/lib/proposals";

export const dynamic = "force-dynamic";

type PublicProposal = {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  status: string;
  currency: string;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  valid_until: string | null;
  payment_terms: string | null;
  terms: string | null;
  client_id: string;
  client_name: string;
};

/** Only ever expose the client-facing shape — never the raw proposal row. */
async function present(token: string) {
  const proposal = (
    await query<PublicProposal>(
      `SELECT p.id,p.number,p.title,p.summary,p.status,p.currency,p.subtotal,p.tax,p.discount,p.total,
              p.valid_until,p.payment_terms,p.terms,p.client_id, c.name client_name
         FROM proposals p JOIN clients c ON c.id=p.client_id
        WHERE p.public_token=$1`,
      [token],
    )
  ).rows[0];
  if (!proposal) return null;
  const [items, milestones] = await Promise.all([
    query(`SELECT description,quantity,unit_price,tax_rate,line_total FROM proposal_items WHERE proposal_id=$1 ORDER BY position`, [proposal.id]),
    query(`SELECT label,percentage,amount FROM proposal_milestones WHERE proposal_id=$1 ORDER BY position`, [proposal.id]),
  ]);
  const expired =
    proposal.valid_until != null && new Date(proposal.valid_until) < new Date() && !["ACCEPTED", "REJECTED"].includes(proposal.status);
  return {
    number: proposal.number,
    title: proposal.title,
    summary: proposal.summary,
    status: expired ? "EXPIRED" : proposal.status,
    company: "JFMCSS",
    client: proposal.client_name,
    currency: proposal.currency,
    subtotal: Number(proposal.subtotal),
    tax: Number(proposal.tax),
    discount: Number(proposal.discount),
    total: Number(proposal.total),
    validUntil: proposal.valid_until,
    paymentTerms: proposal.payment_terms,
    terms: proposal.terms,
    items: items.rows,
    milestones: milestones.rows,
    decidable: !expired && ["SENT", "VIEWED"].includes(proposal.status),
    _id: proposal.id,
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const view = await present(token);
    if (!view) return fail("NOT_FOUND", "Propuesta no encontrada", 404);
    if (view.status === "SENT") {
      await query(`UPDATE proposals SET status='VIEWED', viewed_at=coalesce(viewed_at,now()) WHERE id=$1`, [view._id]);
      view.status = "VIEWED";
    }
    const { _id, ...safe } = view;
    void _id;
    return ok(safe);
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const rl = rateLimit(`proposal:decide:${token}`, 5, 3600);
    if (!rl.ok) return fail("RATE_LIMITED", "Demasiados intentos", 429);

    const view = await present(token);
    if (!view) return fail("NOT_FOUND", "Propuesta no encontrada", 404);
    if (!view.decidable) return fail("INVALID_STATE", "Esta propuesta ya no puede responderse", 409);

    const b = await parseBody(request, publicDecisionSchema);
    if (b.decision === "REJECT") {
      await query(
        `UPDATE proposals SET status='REJECTED', decided_at=now(), decided_note=$2, updated_at=now() WHERE id=$1`,
        [view._id, b.note ?? null],
      );
      return ok({ status: "REJECTED" });
    }

    // ACCEPT: convert (project + opportunity WON). No initial invoice from the
    // portal — staff decide billing.
    await convertProposal(view._id, null, { note: b.note ?? "Aceptada por el cliente", createInitialInvoice: false });
    return ok({ status: "ACCEPTED" });
  } catch (e) {
    return apiError(e);
  }
}
