import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, fail, optionalText } from "@/lib/http";
import { assertClientAccess, resolveClientId } from "@/lib/scope";
import { parseBody, contactCreateSchema } from "@/lib/schema";

export async function GET(request:Request){
  try{
    const user=await requireUser();
    const clientId=resolveClientId(user, new URL(request.url).searchParams.get('clientId'));
    if(!clientId)return fail("VALIDATION", 'clientId requerido', 400);
    assertClientAccess(user, clientId);
    const{rows}=await query(`SELECT * FROM client_contacts WHERE client_id=$1 ORDER BY is_primary DESC,name`,[clientId]);
    return ok({contacts:rows});
  }catch(e){return apiError(e)}
}

export async function POST(request:Request){
  try{
    const user=await requireUser();
    const b=await parseBody(request, contactCreateSchema);
    const clientId=resolveClientId(user, b.clientId);
    if(!clientId)return fail("VALIDATION", 'Cliente requerido', 400);
    assertClientAccess(user, clientId);
    const{rows}=await query(`INSERT INTO client_contacts(client_id,name,email,phone,title,is_primary) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[clientId,b.name,optionalText(b.email,254),optionalText(b.phone,50),optionalText(b.title,120),Boolean(b.isPrimary)]);
    await audit(user.id,'CREATE','CONTACT',rows[0].id,rows[0]);
    return ok({contact:rows[0]}, 201);
  }catch(e){return apiError(e)}
}
