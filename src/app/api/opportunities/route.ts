import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, dateValue, numberValue, optionalText, text } from "@/lib/http";
import { audit } from "@/lib/audit";

export async function GET(){try{await requireUser(['SUPER_ADMIN','ADMIN','FINANCE','PM']);const {rows}=await query(`SELECT o.*,c.name client_name,u.name owner_name FROM opportunities o LEFT JOIN clients c ON c.id=o.client_id LEFT JOIN users u ON u.id=o.owner_id ORDER BY CASE o.stage WHEN 'NEGOTIATION' THEN 1 WHEN 'PROPOSAL' THEN 2 WHEN 'QUALIFIED' THEN 3 WHEN 'LEAD' THEN 4 ELSE 5 END,o.updated_at DESC`);return NextResponse.json({opportunities:rows})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const user=await requireUser(['SUPER_ADMIN','ADMIN','PM']);const b=await request.json();const title=text(b.title,250);if(!title)return NextResponse.json({error:'Título requerido'},{status:400});const {rows}=await query(`INSERT INTO opportunities(client_id,title,stage,amount,probability,expected_close,owner_id,next_action,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[optionalText(b.clientId,50),title,text(b.stage,30)||'QUALIFIED',numberValue(b.amount),Math.min(100,Math.max(0,numberValue(b.probability,25))),dateValue(b.expectedClose),optionalText(b.ownerId,50)||user.id,optionalText(b.nextAction,1000),optionalText(b.notes,5000)]);await audit(user.id,'CREATE','OPPORTUNITY',rows[0].id,rows[0]);return NextResponse.json({opportunity:rows[0]},{status:201})}catch(e){return apiError(e)}}
