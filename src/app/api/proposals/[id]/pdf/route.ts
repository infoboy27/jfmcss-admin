import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { assertClientAccess } from "@/lib/scope";
import { proposalPdf } from "@/lib/pdf";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const proposal = (
      await query<any>(
        `SELECT p.*, c.name client_name FROM proposals p JOIN clients c ON c.id=p.client_id WHERE p.id=$1`,
        [id],
      )
    ).rows[0];
    if (!proposal) return new Response("No encontrada", { status: 404 });
    assertClientAccess(user, proposal.client_id);
    const [items, milestones] = await Promise.all([
      query<any>(`SELECT * FROM proposal_items WHERE proposal_id=$1 ORDER BY position`, [id]),
      query<any>(`SELECT * FROM proposal_milestones WHERE proposal_id=$1 ORDER BY position`, [id]),
    ]);
    const pdf = await proposalPdf(proposal, items.rows, milestones.rows);
    return new Response(Uint8Array.from(pdf).buffer as ArrayBuffer, {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${proposal.number}.pdf"` },
    });
  } catch (e) {
    return apiError(e);
  }
}
