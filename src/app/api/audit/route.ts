import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
export async function GET(request:Request){try{await requireUser(['SUPER_ADMIN','ADMIN']);const u=new URL(request.url);const entity=u.searchParams.get('entityType')||'';const limit=Math.min(250,Math.max(1,Number(u.searchParams.get('limit')||100)));const{rows}=await query(`SELECT a.*,u.name actor_name,u.email actor_email FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id WHERE ($1='' OR a.entity_type=$1) ORDER BY a.created_at DESC LIMIT $2`,[entity,limit]);return NextResponse.json({audit:rows})}catch(e){return apiError(e)}}
