import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, text } from "@/lib/http";
export async function GET(){try{const user=await requireUser();const{rows}=await query(`SELECT * FROM notifications WHERE user_id=$1 OR (user_id IS NULL AND channel='IN_APP') ORDER BY created_at DESC LIMIT 100`,[user.id]);return NextResponse.json({notifications:rows})}catch(e){return apiError(e)}}
export async function PATCH(request:Request){try{const user=await requireUser();const b=await request.json(),id=text(b.id,50);if(!id)return NextResponse.json({error:'id requerido'},{status:400});await query(`UPDATE notifications SET status='READ',read_at=now() WHERE id=$1 AND (user_id=$2 OR user_id IS NULL)`,[id,user.id]);return NextResponse.json({ok:true})}catch(e){return apiError(e)}}
