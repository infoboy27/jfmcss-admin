import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, ok, fail, optionalText } from "@/lib/http";
import { audit } from "@/lib/audit";
import { assertClientAccess } from "@/lib/scope";
import { parseBody } from "@/lib/schema";
import { slaSnapshot } from "@/lib/sla";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

const patchSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().uuid().optional()),
  category: z.string().trim().max(50).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const t = (
      await query<any>(
        `SELECT t.*, c.name client_name, p.name project_name, u.name assignee_name
           FROM tickets t JOIN clients c ON c.id=t.client_id
           LEFT JOIN projects p ON p.id=t.project_id
           LEFT JOIN users u ON u.id=t.assignee_id
          WHERE t.id=$1`,
        [id],
      )
    ).rows[0];
    if (!t) return fail("NOT_FOUND", "Ticket no encontrado", 404);
    assertClientAccess(user, t.client_id);
    const time =
      user.role === "CLIENT"
        ? { rows: [] }
        : await query<any>(
            `SELECT e.*, u.name user_name FROM ticket_time_entries e LEFT JOIN users u ON u.id=e.user_id
              WHERE e.ticket_id=$1 ORDER BY e.logged_at DESC`,
            [id],
          );
    return ok({ ticket: { ...t, sla: slaSnapshot(t) }, timeEntries: time.rows });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN", "SUPPORT", "PM"]);
    const { id } = await params;
    const before = (await query<any>(`SELECT * FROM tickets WHERE id=$1`, [id])).rows[0];
    if (!before) return fail("NOT_FOUND", "Ticket no encontrado", 404);
    const b = await parseBody(request, patchSchema);

    const sets: string[] = ["updated_at = now()"];
    const p: any[] = [id];
    const add = (frag: string, val: any) => {
      p.push(val);
      sets.push(`${frag} $${p.length}`);
    };

    if (b.priority && b.priority !== before.priority) add("priority =", b.priority);
    if (b.category) add("category =", b.category);
    if (b.assigneeId !== undefined) add("assignee_id =", optionalText(b.assigneeId, 50));

    if (b.status && b.status !== before.status) {
      add("status =", b.status);
      const wasWaiting = before.status === "WAITING_CLIENT";
      const nowWaiting = b.status === "WAITING_CLIENT";
      // Pause the SLA clock while waiting on the client; bank the paused span on resume.
      if (nowWaiting && !wasWaiting) sets.push("sla_paused_at = now()");
      if (wasWaiting && !nowWaiting) {
        sets.push("sla_paused_seconds = sla_paused_seconds + EXTRACT(EPOCH FROM (now() - coalesce(sla_paused_at, now())))::int");
        sets.push("sla_paused_at = NULL");
      }
      if (["RESOLVED", "CLOSED"].includes(b.status) && !before.resolved_at) sets.push("resolved_at = now()");
      if (b.status === "IN_PROGRESS" && before.status === "RESOLVED") sets.push("resolved_at = NULL");
    }

    const { rows } = await query<any>(`UPDATE tickets SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, p);
    await audit(user.id, "UPDATE", "TICKET", id, rows[0], before);
    return ok({ ticket: rows[0] });
  } catch (e) {
    return apiError(e);
  }
}
