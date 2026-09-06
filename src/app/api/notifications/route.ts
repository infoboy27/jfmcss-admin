import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, ok } from "@/lib/http";
import { parseBody, notificationReadSchema } from "@/lib/schema";

export async function GET(){try{const user=await requireUser();const{rows}=await query(`SELECT * FROM notifications WHERE user_id=$1 OR (user_id IS NULL AND channel='IN_APP') ORDER BY created_at DESC LIMIT 100`,[user.id]);return ok({notifications:rows})}catch(e){return apiError(e)}}
export async function PATCH(request:Request){try{const user=await requireUser();const b=await parseBody(request, notificationReadSchema);await query(`UPDATE notifications SET status='READ',read_at=now() WHERE id=$1 AND (user_id=$2 OR user_id IS NULL)`,[b.id,user.id]);return ok({ok:true})}catch(e){return apiError(e)}}
