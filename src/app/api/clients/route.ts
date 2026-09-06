import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, fail, text, optionalText, numberValue } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (user.role === "CLIENT") {
      const { rows } = await query(`SELECT c.*, (SELECT count(*) FROM projects p WHERE p.client_id=c.id) project_count,(SELECT coalesce(sum(total-paid_amount),0) FROM invoices i WHERE i.client_id=c.id AND i.status IN ('ISSUED','PARTIAL','OVERDUE')) outstanding FROM clients c WHERE c.id=$1`, [user.clientId]);
      return ok({ clients: rows });
    }
    const url = new URL(request.url); const q = (url.searchParams.get("q") || "").trim();
    const { rows } = await query(`SELECT c.*, (SELECT count(*) FROM projects p WHERE p.client_id=c.id) project_count,(SELECT coalesce(sum(recurring_revenue),0) FROM projects p WHERE p.client_id=c.id AND p.status='ACTIVE') mrr,(SELECT coalesce(sum(total-paid_amount),0) FROM invoices i WHERE i.client_id=c.id AND i.status IN ('ISSUED','PARTIAL','OVERDUE')) outstanding FROM clients c WHERE ($1='' OR c.name ILIKE '%'||$1||'%' OR coalesce(c.tax_id,'') ILIKE '%'||$1||'%' OR coalesce(c.email,'') ILIKE '%'||$1||'%') ORDER BY c.created_at DESC LIMIT 250`, [q]);
    return ok({ clients: rows });
  } catch(error){ return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["SUPER_ADMIN","ADMIN","FINANCE","PM"]);
    const b = await request.json(); const name=text(b.name,200); if(!name) return fail("VALIDATION", "Nombre requerido", 400);
    const code = optionalText(b.code,40) || `CLI-${Date.now().toString().slice(-7)}`;
    const { rows } = await query(`INSERT INTO clients(code,name,legal_name,tax_id,email,phone,website,address,city,country,payment_terms_days,status,notes,tags) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) RETURNING *`,[
      code,name,optionalText(b.legalName,200),optionalText(b.taxId,40),optionalText(b.email,254),optionalText(b.phone,40),optionalText(b.website,300),optionalText(b.address,500),optionalText(b.city,100),optionalText(b.country,100)||"República Dominicana",numberValue(b.paymentTermsDays,30),text(b.status,20)||"ACTIVE",optionalText(b.notes,4000),JSON.stringify(Array.isArray(b.tags)?b.tags:[])
    ]);
    await audit(user.id,"CREATE","CLIENT",rows[0].id,rows[0]); return ok({client:rows[0]}, 201);
  } catch(error){ return apiError(error); }
}
