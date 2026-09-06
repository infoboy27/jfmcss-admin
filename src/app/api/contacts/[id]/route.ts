import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, fail, optionalText } from "@/lib/http";
import { assertClientAccess } from "@/lib/scope";
import { parseBody, contactUpdateSchema } from "@/lib/schema";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=await requireUser();const{id}=await params;
    const before=(await query<any>(`SELECT * FROM client_contacts WHERE id=$1`,[id])).rows[0];
    if(!before)return fail("NOT_FOUND", 'Contacto no encontrado', 404);
    assertClientAccess(user, before.client_id);
    const b=await parseBody(request, contactUpdateSchema);
    const{rows}=await query(`UPDATE client_contacts SET name=coalesce($2,name),email=$3,phone=$4,title=$5,is_primary=coalesce($6,is_primary) WHERE id=$1 RETURNING *`,[id,optionalText(b.name,200),optionalText(b.email,254),optionalText(b.phone,50),optionalText(b.title,120),typeof b.isPrimary==='boolean'?b.isPrimary:null]);
    await audit(user.id,'UPDATE','CONTACT',id,rows[0],before);return ok({contact:rows[0]});
  }catch(e){return apiError(e)}
}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{const user=await requireUser();const{id}=await params;const row=(await query<any>(`SELECT * FROM client_contacts WHERE id=$1`,[id])).rows[0];if(!row)return ok({ok:true});assertClientAccess(user, row.client_id);await query(`DELETE FROM client_contacts WHERE id=$1`,[id]);await audit(user.id,'DELETE','CONTACT',id,undefined,row);return ok({ok:true})}catch(e){return apiError(e)}
}
