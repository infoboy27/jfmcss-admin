import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok } from "@/lib/http";
import { parseBody, automationCreateSchema } from "@/lib/schema";
import { automationCatalog } from "@/lib/automations";

export async function GET() {
  try {
    await requireUser(["SUPER_ADMIN", "ADMIN"]);
    const [automations, runs] = await Promise.all([
      query(`SELECT * FROM automation_rules ORDER BY enabled DESC, name`),
      query(
        `SELECT r.id, r.rule_id, r.event, r.status, r.result, r.created_at, a.name rule_name
           FROM automation_runs r LEFT JOIN automation_rules a ON a.id = r.rule_id
          ORDER BY r.created_at DESC LIMIT 50`,
      ),
    ]);
    return ok({ automations: automations.rows, runs: runs.rows, catalog: automationCatalog() });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN"]);
    const b = await parseBody(request, automationCreateSchema);
    const { rows } = await query(
      `INSERT INTO automation_rules(name,event,enabled,conditions,actions)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING *`,
      [b.name, b.event, b.enabled !== false, JSON.stringify(b.conditions ?? {}), JSON.stringify(b.actions)],
    );
    await audit(user.id, "CREATE", "AUTOMATION", rows[0].id, rows[0]);
    return ok({ automation: rows[0] }, 201);
  } catch (e) {
    return apiError(e);
  }
}
