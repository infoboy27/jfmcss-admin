import { requireUser } from "@/lib/auth";
import { tx } from "@/lib/db";
import { apiError, ok, ApiError } from "@/lib/http";
import { allocateFiscalNumber } from "@/lib/fiscal";
import { audit } from "@/lib/audit";
import { parseBody } from "@/lib/schema";
import { z } from "zod";

const bodySchema = z.object({
  amount: z.coerce.number().positive().optional(),
  full: z.boolean().optional(),
  reason: z.string().trim().min(3, "indica el motivo").max(2000),
  fiscalType: z.enum(["E34", "B04"]).optional(),
});

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const { id } = await params;
    const b = await parseBody(request, bodySchema);

    const result = await tx(async (c) => {
      const original = (
        await c.query<any>(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [id])
      ).rows[0];
      if (!original) throw new ApiError("NOT_FOUND", "Factura no encontrada", 404);
      if (original.document_kind !== "INVOICE") throw new ApiError("VALIDATION", "El documento no es una factura", 400);
      if (!["ISSUED", "PARTIAL", "PAID", "OVERDUE"].includes(original.status)) {
        throw new ApiError("INVALID_STATE", "Solo se acredita una factura emitida", 409);
      }

      const total = Number(original.total);
      const alreadyCredited = Number(original.credited_amount);
      const creditable = round2(total - alreadyCredited);
      if (creditable <= 0) throw new ApiError("INVALID_STATE", "La factura ya fue acreditada por completo", 409);

      const amount = b.full ? creditable : round2(Math.min(b.amount ?? creditable, creditable));
      if (amount <= 0) throw new ApiError("VALIDATION", "Monto de nota de crédito inválido", 400);

      // Split the credit proportionally so subtotal + ITBIS stay consistent.
      const factor = total > 0 ? amount / total : 0;
      const subtotal = round2(Number(original.subtotal) * factor);
      const tax = round2(amount - subtotal);

      const fiscalType = b.fiscalType || (String(original.fiscal_type).startsWith("E") ? "E34" : "B04");

      await c.query(`SELECT pg_advisory_xact_lock(hashtext('jfmcss-invoice-number'))`);
      const year = new Date().getFullYear();
      const last = (
        await c.query<{ number: string }>(`SELECT number FROM invoices WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`, [`NC-${year}-%`])
      ).rows[0];
      const nextSeq = (Number(last?.number?.split("-").at(-1)) || 0) + 1;
      const number = `NC-${year}-${String(nextSeq).padStart(5, "0")}`;
      const ncf = await allocateFiscalNumber(c, fiscalType);

      const note = (
        await c.query<any>(
          `INSERT INTO invoices
             (client_id,project_id,proposal_id,document_kind,references_invoice_id,number,fiscal_type,ncf,
              status,currency,subtotal,tax,discount,total,paid_amount,reason,created_by)
           VALUES ($1,$2,$3,'CREDIT_NOTE',$4,$5,$6,$7,'ISSUED',$8,$9,$10,0,$11,$11,$12,$13)
           RETURNING *`,
          [
            original.client_id, original.project_id, original.proposal_id, original.id,
            number, fiscalType, ncf, original.currency,
            subtotal, tax, amount, b.reason, user.id,
          ],
        )
      ).rows[0];
      await c.query(
        `INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total,position)
         VALUES ($1,$2,1,$3,18,$4,$5,$6,0)`,
        [note.id, `Nota de crédito s/ factura ${original.number} — ${b.reason}`.slice(0, 250), subtotal, subtotal, tax, amount],
      );

      const newCredited = round2(alreadyCredited + amount);
      const fullyCredited = newCredited >= total - 0.005;
      await c.query(
        `UPDATE invoices SET credited_amount=$2, status=CASE WHEN $3 AND status<>'PAID' THEN 'VOID' ELSE status END, updated_at=now() WHERE id=$1`,
        [original.id, newCredited, fullyCredited],
      );

      return { creditNote: note, original: original.number, amount, fullyCredited };
    });

    await audit(user.id, "CREDIT_NOTE", "INVOICE", id, result);
    return ok(result, 201);
  } catch (e) {
    return apiError(e);
  }
}
