import path from "node:path";
import fs from "node:fs/promises";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

const uploadDir=()=>process.env.UPLOAD_DIR||path.join(process.cwd(),'data','uploads');
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser();const{id}=await params;const d=(await query<any>(`SELECT d.*,coalesce(d.client_id,p.client_id,i.client_id,t.client_id) scope_client_id FROM documents d LEFT JOIN projects p ON p.id=d.project_id LEFT JOIN invoices i ON i.id=d.invoice_id LEFT JOIN tickets t ON t.id=d.ticket_id WHERE d.id=$1`,[id])).rows[0];if(!d)return new Response('No encontrado',{status:404});if(user.role==='CLIENT'&&d.scope_client_id!==user.clientId)throw new Error('FORBIDDEN');if(!String(d.url).startsWith('local:'))return Response.redirect(String(d.url),302);const key=String(d.url).slice(6);if(key.includes('/')||key.includes('\\')||key.includes('..'))throw new Error('Ruta inválida');const bytes=await fs.readFile(path.join(uploadDir(),key));const body=Uint8Array.from(bytes).buffer as ArrayBuffer;return new Response(body,{headers:{'content-type':d.mime_type||'application/octet-stream','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(d.name)}`,'cache-control':'private, max-age=60'}})}catch(e){return apiError(e)}}
