import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, fail, optionalText, numberValue, dateValue } from "@/lib/http";
import { parseBody, assetUpdateSchema } from "@/lib/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN", "PM", "FINANCE"]);
    const { id } = await params;
    const before = (await query<any>(`SELECT * FROM assets WHERE id=$1`, [id])).rows[0];
    if (!before) return fail("NOT_FOUND", "Activo no encontrado", 404);
    const b = await parseBody(request, assetUpdateSchema);

    const enablingAuto = b.autoInvoice === true && !before.auto_invoice;
    const nextInvoice = b.nextInvoiceDate
      ? b.nextInvoiceDate
      : enablingAuto
        ? new Date().toISOString().slice(0, 10)
        : (before.next_invoice_date ?? null);

    const { rows } = await query<any>(
      `UPDATE assets SET
         name=coalesce($2,name), type=coalesce($3,type), provider=$4, external_id=$5,
         renewal_date=$6, recurring_cost=coalesce($7,recurring_cost), recurring_price=coalesce($8,recurring_price),
         billing_cycle=coalesce($9,billing_cycle), status=coalesce($10,status),
         auto_invoice=coalesce($11,auto_invoice), next_invoice_date=$12,
         fiscal_type=coalesce($13,fiscal_type), service_description=$14, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [
        id,
        optionalText(b.name, 200),
        b.type ?? null,
        optionalText(b.provider, 200),
        optionalText(b.externalId, 200),
        b.renewalDate ? dateValue(b.renewalDate) : before.renewal_date,
        b.recurringCost != null ? numberValue(b.recurringCost) : null,
        b.recurringPrice != null ? numberValue(b.recurringPrice) : null,
        b.billingCycle ?? null,
        b.status ?? null,
        typeof b.autoInvoice === "boolean" ? b.autoInvoice : null,
        nextInvoice,
        b.fiscalType ?? null,
        b.serviceDescription !== undefined ? optionalText(b.serviceDescription, 500) : before.service_description,
      ],
    );
    await audit(user.id, "UPDATE", "ASSET", id, rows[0], before);
    return ok({ asset: rows[0] });
  } catch (e) {
    return apiError(e);
  }
}
