import { randomBytes } from "node:crypto";
import { query } from "./db";
import { sendEmail, notifyInApp } from "./notifications";
import { fireAutomations } from "./automations";
import { ApiError } from "./errors";
import type { SessionUser } from "./auth";
import { clientScope } from "./scope";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Ask the client to rate a resolved ticket. Idempotent: only the first call for
 * a ticket allocates a token and queues the email. No client email → nothing to
 * do (the survey stays un-requested and just never counts).
 */
export async function requestCsat(ticketId: string): Promise<{ requested: boolean; token: string | null }> {
  const t = (
    await query<any>(
      `SELECT t.number, t.subject, t.csat_token, c.name client_name, c.email client_email, c.id client_id
         FROM tickets t JOIN clients c ON c.id = t.client_id
        WHERE t.id = $1`,
      [ticketId],
    )
  ).rows[0];
  if (!t) return { requested: false, token: null };
  if (t.csat_token) return { requested: false, token: t.csat_token }; // already asked
  if (!t.client_email) return { requested: false, token: null };

  const token = randomBytes(24).toString("base64url");
  await query(`UPDATE tickets SET csat_token = $2, csat_requested_at = now() WHERE id = $1`, [ticketId, token]);

  const link = `${process.env.APP_URL || ""}/csat/${token}`;
  await sendEmail(
    t.client_email,
    `¿Cómo estuvo la atención? · ${t.number}`,
    `<p>Hola ${t.client_name},</p><p>Resolvimos tu caso <strong>${t.number}</strong> — “${t.subject}”.</p>` +
      `<p>¿Nos cuentas qué tal fue la atención? Solo toma unos segundos:</p>` +
      `<p><a href="${link}">${link}</a></p><p>Gracias por confiar en JFMCSS.</p>`,
    t.client_id,
  ).catch(() => null);

  return { requested: true, token };
}

export type CsatView = { number: string; subject: string; company: "JFMCSS"; submitted: boolean; score: number | null; comment: string | null };

export async function csatView(token: string): Promise<CsatView | null> {
  const t = (
    await query<any>(
      `SELECT number, subject, csat_score, csat_comment, csat_submitted_at FROM tickets WHERE csat_token = $1`,
      [token],
    )
  ).rows[0];
  if (!t) return null;
  return {
    number: t.number,
    subject: t.subject,
    company: "JFMCSS",
    submitted: t.csat_submitted_at != null,
    score: t.csat_score,
    comment: t.csat_comment,
  };
}

/**
 * Record a survey response. Throws `ApiError` when the token is unknown or the
 * survey was already answered (the UPDATE guard makes the second writer lose).
 * Notifies the assignee, plus the support leads on a poor score, and emits
 * `ticket.csat_received` for the automation engine.
 */
export async function submitCsat(token: string, input: { score: number; comment?: string | null }) {
  const t = (
    await query<any>(
      `SELECT t.id, t.assignee_id, t.client_id, t.csat_submitted_at, c.name client_name
         FROM tickets t JOIN clients c ON c.id = t.client_id
        WHERE t.csat_token = $1`,
      [token],
    )
  ).rows[0];
  if (!t) throw new ApiError("NOT_FOUND", "Encuesta no encontrada", 404);
  if (t.csat_submitted_at) throw new ApiError("ALREADY_DONE", "Esta encuesta ya fue respondida", 409);

  const { rows } = await query<any>(
    `UPDATE tickets SET csat_score = $2, csat_comment = $3, csat_submitted_at = now()
      WHERE csat_token = $1 AND csat_submitted_at IS NULL
    RETURNING number, subject, priority`,
    [token, input.score, input.comment ?? null],
  );
  if (!rows[0]) throw new ApiError("ALREADY_DONE", "Esta encuesta ya fue respondida", 409);
  const ticket = rows[0];

  const targets = new Set<string>();
  if (t.assignee_id) targets.add(t.assignee_id);
  if (input.score <= 2) {
    const leads = await query<{ id: string }>(
      `SELECT id FROM users WHERE active=true AND role IN ('SUPER_ADMIN','ADMIN','SUPPORT')`,
    );
    for (const l of leads.rows) targets.add(l.id);
  }
  const title = `CSAT ${input.score}/5 · ${ticket.number}`;
  const body = input.comment ? `“${input.comment.slice(0, 160)}”` : t.client_name;
  for (const id of targets) await notifyInApp(id, title, body, t.client_id, { ticketId: t.id }, "SUPPORT");

  fireAutomations("ticket.csat_received", {
    id: t.id,
    number: ticket.number,
    subject: ticket.subject,
    priority: ticket.priority,
    score: input.score,
    comment: input.comment ?? "",
    clientId: t.client_id,
    clientName: t.client_name,
  });

  return { status: "SUBMITTED" as const, score: input.score };
}

export type CsatSummary = {
  average: number | null;
  responses: number;
  sent: number;
  responseRate: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  recent: { number: string; score: number; comment: string | null; client: string; at: string }[];
};

/** 90-day CSAT rollup, client-scoped like the rest of the support metrics. */
export async function csatSummary(user: SessionUser): Promise<CsatSummary> {
  const s = clientScope(user, "t.client_id");
  const scoped = s.where ? s.where.replace(/^WHERE /, "") + " AND " : "";
  const [agg, recent] = await Promise.all([
    query<any>(
      `SELECT
         count(*) FILTER (WHERE csat_requested_at IS NOT NULL)::int sent,
         count(*) FILTER (WHERE csat_score IS NOT NULL)::int responses,
         avg(csat_score) FILTER (WHERE csat_score IS NOT NULL) average,
         count(*) FILTER (WHERE csat_score = 1)::int d1,
         count(*) FILTER (WHERE csat_score = 2)::int d2,
         count(*) FILTER (WHERE csat_score = 3)::int d3,
         count(*) FILTER (WHERE csat_score = 4)::int d4,
         count(*) FILTER (WHERE csat_score = 5)::int d5
       FROM tickets t
       WHERE ${scoped} csat_requested_at > now() - interval '90 days'`,
      s.params,
    ),
    query<any>(
      `SELECT t.number, t.csat_score score, t.csat_comment comment,
              t.csat_submitted_at::text at, c.name client
         FROM tickets t JOIN clients c ON c.id = t.client_id
        WHERE ${scoped} t.csat_score IS NOT NULL
        ORDER BY t.csat_submitted_at DESC LIMIT 8`,
      s.params,
    ),
  ]);
  const a = agg.rows[0];
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    average: a.average != null ? round1(Number(a.average)) : null,
    responses: a.responses,
    sent: a.sent,
    responseRate: a.sent > 0 ? round1((a.responses / a.sent) * 100) : null,
    distribution: { 1: a.d1, 2: a.d2, 3: a.d3, 4: a.d4, 5: a.d5 },
    recent: recent.rows,
  };
}
