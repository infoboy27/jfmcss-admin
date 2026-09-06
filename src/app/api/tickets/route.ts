import { requireUser } from "@/lib/auth";
import { nextHumanNumber, query, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyInApp, sendEmail } from "@/lib/notifications";
import { apiError, ok, fail, optionalText, numberValue } from "@/lib/http";
import { assertClientAccess, resolveClientId } from "@/lib/scope";
import { parseBody, ticketCreateSchema } from "@/lib/schema";

const DEFAULT_SLA_HOURS: Record<string, number> = { LOW: 48, MEDIUM: 24, HIGH: 8, URGENT: 2 };

async function slaHoursFor(priority: string): Promise<number> {
  const { rows } = await query<{ value: Record<string, unknown> }>(
    `SELECT value FROM settings WHERE key='sla'`,
  );
  const configured = numberValue(rows[0]?.value?.[priority]);
  return configured > 0 ? configured : DEFAULT_SLA_HOURS[priority] ?? 24;
}

export async function GET() {
  try {
    const user = await requireUser();
    const p: unknown[] = [];
    let where = "";
    if (user.role === "CLIENT") {
      where = "WHERE t.client_id=$1";
      p.push(user.clientId);
    }
    const { rows } = await query(
      `SELECT t.*,c.name client_name,p.name project_name,u.name assignee_name,
              CASE WHEN t.sla_due_at<now() AND t.status NOT IN ('RESOLVED','CLOSED') THEN true ELSE false END sla_breached
         FROM tickets t
         JOIN clients c ON c.id=t.client_id
         LEFT JOIN projects p ON p.id=t.project_id
         LEFT JOIN users u ON u.id=t.assignee_id
         ${where}
        ORDER BY CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                 t.created_at DESC
        LIMIT 500`,
      p,
    );
    return ok({ tickets: rows });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const b = await parseBody(request, ticketCreateSchema);
    const clientId = resolveClientId(user, b.clientId);
    const { subject, description } = b;
    if (!clientId) return fail("VALIDATION", "Cliente requerido", 400);
    assertClientAccess(user, clientId);
    const priority = b.priority ?? "MEDIUM";
    const slaHours = await slaHoursFor(priority);

    // Number allocation + both inserts share one transaction so concurrent
    // ticket creation can't collide on the unique `number`.
    const ticket = await tx(async (c) => {
      const number = await nextHumanNumber(c, "SUP", "tickets");
      const { rows } = await c.query<Record<string, unknown> & { id: string }>(
        `INSERT INTO tickets
           (number,client_id,project_id,subject,description,priority,category,assignee_id,requester_email,sla_due_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+($10||' hours')::interval)
         RETURNING *`,
        [
          number,
          clientId,
          optionalText(b.projectId, 50),
          subject,
          description,
          priority,
          b.category ?? "GENERAL",
          optionalText(b.assigneeId, 50),
          optionalText(b.requesterEmail, 254) || user.email,
          slaHours,
        ],
      );
      await c.query(
        `INSERT INTO ticket_messages(ticket_id,author_id,author_name,body,internal) VALUES($1,$2,$3,$4,false)`,
        [rows[0].id, user.id, user.name, description],
      );
      return rows[0];
    });

    const admins = await query<{ id: string; email: string }>(
      `SELECT id,email FROM users WHERE active=true AND role IN ('SUPER_ADMIN','ADMIN','SUPPORT')`,
    );
    await Promise.all(
      admins.rows.map((a) =>
        notifyInApp(a.id, `Nuevo ticket ${ticket.number}`, `${priority} · ${subject}`, clientId, { ticketId: ticket.id }),
      ),
    );
    if (priority === "URGENT") {
      await Promise.all(
        admins.rows.map((a) =>
          sendEmail(
            a.email,
            `[URGENTE] ${ticket.number} · ${subject}`,
            `<p>${description}</p><p>Cliente: ${clientId}</p>`,
            clientId,
          ).catch(() => null),
        ),
      );
    }
    await audit(user.id, "CREATE", "TICKET", ticket.id, ticket);
    return ok({ ticket }, 201);
  } catch (e) {
    return apiError(e);
  }
}
