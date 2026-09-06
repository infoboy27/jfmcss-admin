import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, fail, optionalText, numberValue } from "@/lib/http";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{const user=await requireUser();const {id}=await params;if(user.role==='CLIENT'&&user.clientId!==id) throw Object.assign(new Error('FORBIDDEN'),{status:403});
    const [client,projects,invoices,tickets,assets,contacts]=await Promise.all([
      query(`SELECT * FROM clients WHERE id=$1`,[id]),query(`SELECT * FROM projects WHERE client_id=$1 ORDER BY created_at DESC`,[id]),query(`SELECT * FROM invoices WHERE client_id=$1 ORDER BY issue_date DESC LIMIT 100`,[id]),query(`SELECT * FROM tickets WHERE client_id=$1 ORDER BY created_at DESC LIMIT 100`,[id]),query(`SELECT * FROM assets WHERE client_id=$1 ORDER BY renewal_date NULLS LAST`,[id]),query(`SELECT * FROM client_contacts WHERE client_id=$1 ORDER BY is_primary DESC,name`,[id])]);
    if(!client.rows[0])return fail("NOT_FOUND", 'No encontrado', 404);return ok({client:client.rows[0],projects:projects.rows,invoices:invoices.rows,tickets:tickets.rows,assets:assets.rows,contacts:contacts.rows});
  }catch(e){return apiError(e)}}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const user=await requireUser(['SUPER_ADMIN','ADMIN','FINANCE','PM']);const {id}=await params;const before=(await query(`SELECT * FROM clients WHERE id=$1`,[id])).rows[0];if(!before)return fail("NOT_FOUND", 'No encontrado', 404);const b=await request.json();
    const {rows}=await query(`UPDATE clients SET name=coalesce($2,name),legal_name=$3,tax_id=$4,email=$5,phone=$6,website=$7,address=$8,city=$9,payment_terms_days=$10,status=coalesce($11,status),health_score=$12,notes=$13,updated_at=now() WHERE id=$1 RETURNING *`,[id,optionalText(b.name,200),optionalText(b.legalName,200),optionalText(b.taxId,40),optionalText(b.email,254),optionalText(b.phone,40),optionalText(b.website,300),optionalText(b.address,500),optionalText(b.city,100),numberValue(b.paymentTermsDays,before.payment_terms_days),optionalText(b.status,20),numberValue(b.healthScore,before.health_score),optionalText(b.notes,4000)]);
    await audit(user.id,'UPDATE','CLIENT',id,rows[0],before);return ok({client:rows[0]});
  }catch(e){return apiError(e)}}
