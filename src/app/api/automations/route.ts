import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, fail, text } from "@/lib/http";
export async function GET(){try{await requireUser(['SUPER_ADMIN','ADMIN']);const{rows}=await query(`SELECT * FROM automation_rules ORDER BY enabled DESC,name`);return ok({automations:rows})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const user=await requireUser(['SUPER_ADMIN','ADMIN']);const b=await request.json();const name=text(b.name,200),event=text(b.event,100);if(!name||!event)return fail("VALIDATION", 'Nombre y evento requeridos', 400);const{rows}=await query(`INSERT INTO automation_rules(name,event,enabled,conditions,actions) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING *`,[name,event,b.enabled!==false,JSON.stringify(b.conditions||{}),JSON.stringify(Array.isArray(b.actions)?b.actions:[])]);await audit(user.id,'CREATE','AUTOMATION',rows[0].id,rows[0]);return ok({automation:rows[0]}, 201)}catch(e){return apiError(e)}}
