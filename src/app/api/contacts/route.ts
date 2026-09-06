import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, fail, text, optionalText } from "@/lib/http";

export async function GET(request:Request){
  try{
    const user=await requireUser();
    const url=new URL(request.url);
    const requested=url.searchParams.get('clientId');
    const clientId=user.role==='CLIENT'?user.clientId:requested;
    if(!clientId)return fail("VALIDATION", 'clientId requerido', 400);
    const{rows}=await query(`SELECT * FROM client_contacts WHERE client_id=$1 ORDER BY is_primary DESC,name`,[clientId]);
    return ok({contacts:rows});
  }catch(e){return apiError(e)}
}

export async function POST(request:Request){
  try{
    const user=await requireUser();
    const b=await request.json();
    const clientId=user.role==='CLIENT'?user.clientId:text(b.clientId,50);
    const name=text(b.name,200);
    if(!clientId||!name)return fail("VALIDATION", 'Cliente y nombre requeridos', 400);
    const{rows}=await query(`INSERT INTO client_contacts(client_id,name,email,phone,title,is_primary) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[clientId,name,optionalText(b.email,254),optionalText(b.phone,50),optionalText(b.title,120),Boolean(b.isPrimary)]);
    await audit(user.id,'CREATE','CONTACT',rows[0].id,rows[0]);
    return ok({contact:rows[0]}, 201);
  }catch(e){return apiError(e)}
}
