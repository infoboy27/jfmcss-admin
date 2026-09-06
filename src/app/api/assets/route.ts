import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, optionalText, numberValue, dateValue } from "@/lib/http";
import { parseBody, assetCreateSchema } from "@/lib/schema";
import { clientScope } from "@/lib/scope";

export async function GET() {
  try {
    const user = await requireUser();
    const scope = clientScope(user, "a.client_id");
    const { rows } = await query(
      `SELECT a.*, c.name client_name, p.name project_name,
              (a.renewal_date - CURRENT_DATE) days_to_renewal
         FROM assets a
         JOIN clients c ON c.id = a.client_id
         LEFT JOIN projects p ON p.id = a.project_id
         ${scope.where}
        ORDER BY a.renewal_date NULLS LAST, a.name`,
      scope.params,
    );
    return ok({ assets: rows });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN", "PM", "FINANCE"]);
    const b = await parseBody(request, assetCreateSchema);
    // When auto-invoicing is on, seed the schedule from the given date (or today).
    const nextInvoice = b.autoInvoice ? b.nextInvoiceDate || new Date().toISOString().slice(0, 10) : (b.nextInvoiceDate ?? null);
    const { rows } = await query(
      `INSERT INTO assets
         (client_id,project_id,type,name,provider,external_id,renewal_date,recurring_cost,recurring_price,
          billing_cycle,status,metadata,auto_invoice,next_invoice_date,fiscal_type,service_description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
       RETURNING *`,
      [
        b.clientId,
        optionalText(b.projectId, 50),
        b.type || "OTHER",
        b.name,
        optionalText(b.provider, 200),
        optionalText(b.externalId, 200),
        dateValue(b.renewalDate),
        numberValue(b.recurringCost),
        numberValue(b.recurringPrice),
        b.billingCycle || "MONTHLY",
        b.status || "ACTIVE",
        JSON.stringify(b.metadata || {}),
        b.autoInvoice ?? false,
        nextInvoice,
        b.fiscalType || "E31",
        optionalText(b.serviceDescription, 500),
      ],
    );
    await audit(user.id, "CREATE", "ASSET", rows[0].id, rows[0]);
    return ok({ asset: rows[0] }, 201);
  } catch (e) {
    return apiError(e);
  }
}
