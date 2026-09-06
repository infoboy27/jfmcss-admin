import path from "node:path";
import fs from "node:fs/promises";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok } from "@/lib/http";
const uploadDir=()=>process.env.UPLOAD_DIR||path.join(process.cwd(),'data','uploads');
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser();const{id}=await params;const d=(await query<any>(`SELECT d.*,coalesce(d.client_id,p.client_id,i.client_id,t.client_id) scope_client_id FROM documents d LEFT JOIN projects p ON p.id=d.project_id LEFT JOIN invoices i ON i.id=d.invoice_id LEFT JOIN tickets t ON t.id=d.ticket_id WHERE d.id=$1`,[id])).rows[0];if(!d)return ok({ok:true});if(user.role==='CLIENT'&&d.scope_client_id!==user.clientId)throw new Error('FORBIDDEN');if(user.role==='CLIENT'&&d.created_by!==user.id)throw new Error('FORBIDDEN');await query(`DELETE FROM documents WHERE id=$1`,[id]);if(String(d.url).startsWith('local:')){const key=String(d.url).slice(6);if(!key.includes('/')&&!key.includes('\\')&&!key.includes('..'))await fs.unlink(path.join(uploadDir(),key)).catch(()=>null)}await audit(user.id,'DELETE','DOCUMENT',id,undefined,d);return ok({ok:true})}catch(e){return apiError(e)}}
