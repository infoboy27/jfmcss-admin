import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, fail, optionalText, dateValue } from "@/lib/http";
import { assertClientAccess } from "@/lib/scope";
import { parseBody, taskCreateSchema } from "@/lib/schema";

export async function GET(request:Request){try{const user=await requireUser();const projectId=new URL(request.url).searchParams.get('projectId');if(!projectId)return fail("VALIDATION", 'projectId requerido', 400);const project=(await query<any>(`SELECT client_id FROM projects WHERE id=$1`,[projectId])).rows[0];if(!project)return fail("NOT_FOUND", 'Proyecto no encontrado', 404);assertClientAccess(user, project.client_id);const{rows}=await query(`SELECT t.*,u.name assignee_name FROM project_tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE project_id=$1 ORDER BY CASE t.status WHEN 'BLOCKED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'TODO' THEN 3 ELSE 4 END,t.due_date NULLS LAST,t.created_at`,[projectId]);return ok({tasks:rows})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const user=await requireUser(['SUPER_ADMIN','ADMIN','PM']);const b=await parseBody(request, taskCreateSchema);const proj=(await query<any>(`SELECT client_id FROM projects WHERE id=$1`,[b.projectId])).rows[0];if(!proj)return fail("NOT_FOUND", 'Proyecto no encontrado', 404);const{rows}=await query(`INSERT INTO project_tasks(project_id,title,status,priority,assignee_id,due_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[b.projectId,b.title,b.status||'TODO',b.priority||'MEDIUM',optionalText(b.assigneeId,50),dateValue(b.dueDate)]);await audit(user.id,'CREATE','TASK',rows[0].id,rows[0]);return ok({task:rows[0]}, 201)}catch(e){return apiError(e)}}
