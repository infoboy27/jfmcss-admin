import { hashPassword, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, optionalText } from "@/lib/http";
import { parseBody, userCreateSchema } from "@/lib/schema";
export async function GET(){try{await requireUser(['SUPER_ADMIN','ADMIN']);const{rows}=await query(`SELECT id,email,name,role,active,client_id,created_at,last_login FROM (SELECT u.*, (SELECT max(created_at) FROM sessions s WHERE s.user_id=u.id) last_login FROM users u) x ORDER BY active DESC,name`);return ok({users:rows})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const actor=await requireUser(['SUPER_ADMIN']);const b=await parseBody(request, userCreateSchema);const email=b.email.toLowerCase();const role=b.role||'ADMIN';const{rows}=await query(`INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,$3,$4,$5) RETURNING id,email,name,role,active,client_id,created_at`,[email,b.name,hashPassword(b.password),role,optionalText(b.clientId,50)]);await audit(actor.id,'CREATE','USER',rows[0].id,rows[0]);return ok({user:rows[0]}, 201)}catch(e){return apiError(e)}}
