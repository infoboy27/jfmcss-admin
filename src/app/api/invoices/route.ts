import { requireUser } from "@/lib/auth";
import { tx, query } from "@/lib/db";
import { calculateInvoice } from "@/lib/billing";
import { allocateFiscalNumber, submitEcf } from "@/lib/fiscal";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/notifications";
import { apiError, ok, optionalText, dateValue } from "@/lib/http";
import { parseBody, invoiceCreateSchema } from "@/lib/schema";

export async function GET() {
  try {
    const user = await requireUser();
    const params: unknown[] = [];
    let where = "";
    if (user.role === "CLIENT") {
      where = "WHERE i.client_id=$1";
      params.push(user.clientId);
    }
    const { rows } = await query(
      `SELECT i.*,c.name client_name,c.tax_id,c.email client_email,p.name project_name
         FROM invoices i
         JOIN clients c ON c.id=i.client_id
         LEFT JOIN projects p ON p.id=i.project_id
         ${where}
        ORDER BY i.issue_date DESC,i.created_at DESC
        LIMIT 500`,
      params,
    );
    return ok({ invoices: rows });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const b = await parseBody(request, invoiceCreateSchema);
    const clientId = b.clientId;

    const totals = calculateInvoice(b.items, b.discount);
    const issue = Boolean(b.issue);
    const fiscalType = b.fiscalType || "E31";

    const invoice = await tx(async (c) => {
      // Serialize invoice-number allocation without locking the whole table.
      await c.query(`SELECT pg_advisory_xact_lock(hashtext('jfmcss-invoice-number'))`);
      const year = new Date().getFullYear();
      const last = await c.query<{ number: string }>(
        `SELECT number FROM invoices WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`,
        [`FAC-${year}-%`],
      );
      const nextSeq = (Number(last.rows[0]?.number?.split("-").at(-1)) || 0) + 1;
      const number = `FAC-${year}-${String(nextSeq).padStart(5, "0")}`;

      const ncf = issue ? await allocateFiscalNumber(c, fiscalType) : null;
      const issueDate = dateValue(b.issueDate) || new Date().toISOString().slice(0, 10);

      let dueDate = dateValue(b.dueDate);
      if (!dueDate) {
        const cr = await c.query<{ payment_terms_days: number }>(
          `SELECT payment_terms_days FROM clients WHERE id=$1`,
          [clientId],
        );
        const d = new Date(issueDate + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + Number(cr.rows[0]?.payment_terms_days ?? 30));
        dueDate = d.toISOString().slice(0, 10);
      }

      const ins = await c.query<Record<string, unknown> & { id: string }>(
        `INSERT INTO invoices
           (client_id,project_id,number,fiscal_type,ncf,status,currency,issue_date,due_date,
            subtotal,tax,discount,total,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
          clientId,
          optionalText(b.projectId, 50),
          number,
          fiscalType,
          ncf,
          issue ? "ISSUED" : "DRAFT",
          b.currency || "DOP",
          issueDate,
          dueDate,
          totals.subtotal,
          totals.tax,
          totals.discount,
          totals.total,
          optionalText(b.notes, 4000),
          user.id,
        ],
      );
      for (const item of totals.items) {
        await c.query(
          `INSERT INTO invoice_items
             (invoice_id,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total,position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            ins.rows[0].id,
            item.description,
            item.quantity,
            item.unitPrice,
            item.taxRate,
            item.lineSubtotal,
            item.lineTax,
            item.lineTotal,
            item.position,
          ],
        );
      }
      return ins.rows[0];
    });

    if (issue) {
      const full = (
        await query<Record<string, unknown> & { client_email?: string; client_name?: string }>(
          `SELECT i.*,c.name client_name,c.email client_email,c.tax_id
             FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.id=$1`,
          [invoice.id],
        )
      ).rows[0];
      try {
        const ecf = await submitEcf(full);
        await query(`UPDATE invoices SET ecf_status=$2,ecf_track_id=$3 WHERE id=$1`, [invoice.id, ecf.status, ecf.trackId]);
      } catch {
        await query(`UPDATE invoices SET ecf_status='FAILED' WHERE id=$1`, [invoice.id]);
      }
      if (full?.client_email) {
        await sendEmail(
          full.client_email,
          `Factura ${invoice.number} · JFMCSS`,
          `<p>Hola ${full.client_name ?? ""},</p><p>Hemos emitido la factura <strong>${invoice.number}</strong> por RD$${Number(
            invoice.total,
          ).toLocaleString("en-US", { minimumFractionDigits: 2 })}.</p><p>Puedes consultarla desde tu portal JFMCSS.</p>`,
          clientId,
        ).catch(() => null);
      }
    }

    await audit(user.id, "CREATE", "INVOICE", invoice.id, invoice);
    return ok({ invoice }, 201);
  } catch (e) {
    return apiError(e);
  }
}
