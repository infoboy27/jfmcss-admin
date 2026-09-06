import { requireUser } from "@/lib/auth";
import { query, tx } from "@/lib/db";
import { apiError, ok, fail } from "@/lib/http";
import { audit } from "@/lib/audit";
import { parseBody } from "@/lib/schema";
import { z } from "zod";

const schema = z.object({
  minutes: z.coerce.number().int().positive().max(24 * 60),
  description: z.string().trim().max(1000).optional(),
  billable: z.boolean().optional(),
  loggedAt: z
    .preprocess((v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined), z.string().optional()),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN", "SUPPORT", "PM"]);
    const { id } = await params;
    const ticket = (await query<any>(`SELECT id FROM tickets WHERE id=$1`, [id])).rows[0];
    if (!ticket) return fail("NOT_FOUND", "Ticket no encontrado", 404);
    const b = await parseBody(request, schema);
    const billable = b.billable ?? true;

    const entry = await tx(async (c) => {
      const { rows } = await c.query<any>(
        `INSERT INTO ticket_time_entries(ticket_id,user_id,minutes,description,billable,logged_at)
         VALUES ($1,$2,$3,$4,$5,coalesce($6::timestamptz, now())) RETURNING *`,
        [id, user.id, b.minutes, b.description ?? null, billable, b.loggedAt ?? null],
      );
      await c.query(
        `UPDATE tickets SET billable_minutes = (
           SELECT coalesce(sum(minutes),0) FROM ticket_time_entries WHERE ticket_id=$1 AND billable=true
         ), updated_at=now() WHERE id=$1`,
        [id],
      );
      return rows[0];
    });
    await audit(user.id, "TIME_LOG", "TICKET", id, entry);
    return ok({ entry }, 201);
  } catch (e) {
    return apiError(e);
  }
}
