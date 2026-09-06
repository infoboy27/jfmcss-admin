import { requireUser } from "@/lib/auth";
import { nextHumanNumber, query, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, optionalText, numberValue, dateValue } from "@/lib/http";
import { parseBody, projectCreateSchema } from "@/lib/schema";

export async function GET(){try{const user=await requireUser();const params:unknown[]=[];let where='';if(user.role==='CLIENT'){where='WHERE p.client_id=$1';params.push(user.clientId)}const {rows}=await query(`SELECT p.*,c.name client_name,u.name owner_name,CASE WHEN p.budget>0 THEN round(((p.budget-p.internal_cost)/p.budget*100)::numeric,1) ELSE 0 END margin_pct FROM projects p JOIN clients c ON c.id=p.client_id LEFT JOIN users u ON u.id=p.owner_id ${where} ORDER BY p.updated_at DESC`,params);return ok({projects:rows})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const user=await requireUser(['SUPER_ADMIN','ADMIN','PM']);const b=await parseBody(request, projectCreateSchema);const name=b.name,clientId=b.clientId;const explicitCode=optionalText(b.code,50);
  const project=await tx(async c=>{const code=explicitCode||await nextHumanNumber(c,'PRJ','projects');const {rows}=await c.query(`INSERT INTO projects(client_id,code,name,description,status,progress,budget,internal_cost,recurring_revenue,start_date,due_date,owner_id,repository_url,production_url,environment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb) RETURNING *`,[clientId,code,name,optionalText(b.description,5000),b.status||'PLANNING',numberValue(b.progress,0),numberValue(b.budget),numberValue(b.internalCost),numberValue(b.recurringRevenue),dateValue(b.startDate),dateValue(b.dueDate),optionalText(b.ownerId,50)||user.id,optionalText(b.repositoryUrl,500),optionalText(b.productionUrl,500),JSON.stringify(b.environment||{})]);return rows[0]});
  await audit(user.id,'CREATE','PROJECT',project.id,project);return ok({project}, 201)}catch(e){return apiError(e)}}
