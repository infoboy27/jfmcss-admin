import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, fail } from "@/lib/http";
import { parseBody, automationUpdateSchema } from "@/lib/schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN"]);
    const { id } = await params;
    const b = await parseBody(request, automationUpdateSchema);
    const before = (await query(`SELECT * FROM automation_rules WHERE id=$1`, [id])).rows[0];
    if (!before) return fail("NOT_FOUND", "Regla no encontrada", 404);

    const sets: string[] = [];
    const vals: unknown[] = [id];
    const add = (col: string, val: unknown, cast = "") => {
      vals.push(val);
      sets.push(`${col}=$${vals.length}${cast}`);
    };
    if (b.name !== undefined) add("name", b.name);
    if (b.event !== undefined) add("event", b.event);
    if (b.enabled !== undefined) add("enabled", b.enabled);
    if (b.conditions !== undefined) add("conditions", JSON.stringify(b.conditions), "::jsonb");
    if (b.actions !== undefined) add("actions", JSON.stringify(b.actions), "::jsonb");
    if (!sets.length) return ok({ automation: before });

    const { rows } = await query(
      `UPDATE automation_rules SET ${sets.join(",")}, updated_at=now() WHERE id=$1 RETURNING *`,
      vals,
    );
    await audit(user.id, "UPDATE", "AUTOMATION", id, rows[0], before);
    return ok({ automation: rows[0] });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN"]);
    const { id } = await params;
    const { rows } = await query(`DELETE FROM automation_rules WHERE id=$1 RETURNING id,name`, [id]);
    if (!rows[0]) return fail("NOT_FOUND", "Regla no encontrada", 404);
    await audit(user.id, "DELETE", "AUTOMATION", id, rows[0]);
    return ok({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
