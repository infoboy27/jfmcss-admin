import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, text } from "@/lib/http";
import { audit } from "@/lib/audit";
export async function GET(){try{await requireUser(['SUPER_ADMIN','ADMIN']);const{rows}=await query(`SELECT * FROM automation_rules ORDER BY enabled DESC,name`);return NextResponse.json({automations:rows})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const user=await requireUser(['SUPER_ADMIN','ADMIN']);const b=await request.json();const name=text(b.name,200),event=text(b.event,100);if(!name||!event)return NextResponse.json({error:'Nombre y evento requeridos'},{status:400});const{rows}=await query(`INSERT INTO automation_rules(name,event,enabled,conditions,actions) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING *`,[name,event,b.enabled!==false,JSON.stringify(b.conditions||{}),JSON.stringify(Array.isArray(b.actions)?b.actions:[])]);await audit(user.id,'CREATE','AUTOMATION',rows[0].id,rows[0]);return NextResponse.json({automation:rows[0]},{status:201})}catch(e){return apiError(e)}}
