import nodemailer from "nodemailer";
import { query, tx } from "./db";

type Channel = "IN_APP" | "EMAIL" | "WHATSAPP";

async function insertNotification(input: {
  userId?: string | null;
  clientId?: string | null;
  channel: Channel;
  title: string;
  body: string;
  destination?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO notifications(user_id,client_id,channel,title,body,destination,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      input.userId ?? null,
      input.clientId ?? null,
      input.channel,
      input.title,
      input.body,
      input.destination ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rows[0]?.id;
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);

/** In-app notification — a plain row write, safe to await in the request path. */
export async function notifyInApp(
  userId: string | null,
  title: string,
  body: string,
  clientId?: string | null,
  metadata?: Record<string, unknown>,
) {
  const id = await insertNotification({ userId, clientId, channel: "IN_APP", title, body, metadata });
  await query(`UPDATE notifications SET status='SENT',sent_at=now() WHERE id=$1`, [id]);
  return id;
}

/**
 * In-app notification that is written at most once per `dedupKey` per rolling
 * 20 hours — for recurring cron reminders ("invoice overdue", "renewal due")
 * that would otherwise re-fire on every run. Returns the id, or null if skipped.
 */
export async function notifyInAppOnce(
  userId: string | null,
  dedupKey: string,
  title: string,
  body: string,
  clientId?: string | null,
) {
  const existing = await query<{ id: string }>(
    `SELECT id FROM notifications
      WHERE channel='IN_APP' AND coalesce(user_id::text,'')=coalesce($1,'')
        AND metadata->>'dedup'=$2 AND created_at > now()-interval '20 hours'
      LIMIT 1`,
    [userId, dedupKey],
  );
  if (existing.rows.length) return null;
  return notifyInApp(userId, title, body, clientId, { dedup: dedupKey });
}

/**
 * Queue an email. Returns immediately after writing a PENDING outbox row — the
 * actual SMTP send happens in `deliverPendingNotifications()`, driven by
 * `/api/cron/notifications`. Never blocks the request on the mail server.
 */
export async function sendEmail(to: string, subject: string, html: string, clientId?: string | null) {
  const id = await insertNotification({
    clientId,
    channel: "EMAIL",
    title: subject,
    body: stripHtml(html),
    destination: to,
    metadata: { subject, html },
  });
  return { id, status: "QUEUED" as const };
}

/** Queue a WhatsApp message. Same out-of-band delivery as `sendEmail`. */
export async function sendWhatsApp(to: string, body: string, clientId?: string | null) {
  const id = await insertNotification({
    clientId,
    channel: "WHATSAPP",
    title: "WhatsApp",
    body,
    destination: to,
  });
  return { id, status: "QUEUED" as const };
}

// ─── outbox delivery ────────────────────────────────────────────────────────

const MAX_ATTEMPTS = Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5);
// Exponential-ish backoff in minutes, indexed by attempt count.
const BACKOFF_MINUTES = [1, 5, 15, 60, 240];

let mailer: ReturnType<typeof nodemailer.createTransport> | null = null;
function transport() {
  if (!process.env.SMTP_HOST) return null;
  mailer ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return mailer;
}

type OutboxRow = {
  id: string;
  channel: "EMAIL" | "WHATSAPP";
  destination: string | null;
  body: string;
  attempts: number;
  metadata: { subject?: string; html?: string } | null;
};

async function deliverOne(row: OutboxRow): Promise<void> {
  if (!row.destination) throw new Error("sin destinatario");

  if (row.channel === "EMAIL") {
    const t = transport();
    if (!t) throw Object.assign(new Error("SMTP no configurado"), { skip: true });
    await t.sendMail({
      from: process.env.SMTP_FROM || "JFMCSS <notificaciones@jfmcss.com>",
      to: row.destination,
      subject: row.metadata?.subject || "JFMCSS",
      html: row.metadata?.html || row.body,
    });
    return;
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw Object.assign(new Error("WhatsApp no configurado"), { skip: true });
  const res = await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: row.destination, type: "text", text: { body: row.body } }),
    signal: AbortSignal.timeout(Number(process.env.WHATSAPP_TIMEOUT_MS || 15_000)),
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}`);
}

export type DeliveryResult = { picked: number; sent: number; retry: number; failed: number; skipped: number };

/**
 * Delivers up to `limit` pending EMAIL/WHATSAPP notifications. Each row is
 * locked with `FOR UPDATE SKIP LOCKED` so concurrent cron runs don't double-send.
 * Transient failures are retried with backoff up to `MAX_ATTEMPTS`; a provider
 * that isn't configured is left PENDING (not counted as failure).
 */
export async function deliverPendingNotifications(limit = 50): Promise<DeliveryResult> {
  const result: DeliveryResult = { picked: 0, sent: 0, retry: 0, failed: 0, skipped: 0 };

  const rows = await tx(async (c) => {
    const { rows } = await c.query<OutboxRow>(
      `SELECT id,channel,destination,body,attempts,metadata
         FROM notifications
        WHERE status='PENDING' AND channel IN ('EMAIL','WHATSAPP') AND next_attempt_at<=now()
        ORDER BY next_attempt_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    // Mark them in-flight inside the same tx so another runner won't grab them.
    if (rows.length) {
      await c.query(`UPDATE notifications SET next_attempt_at=now()+interval '10 minutes' WHERE id = ANY($1)`, [
        rows.map((r) => r.id),
      ]);
    }
    return rows;
  });

  result.picked = rows.length;

  for (const row of rows) {
    try {
      await deliverOne(row);
      await query(`UPDATE notifications SET status='SENT',sent_at=now(),last_error=null WHERE id=$1`, [row.id]);
      result.sent++;
    } catch (err) {
      const e = err as { skip?: boolean; message?: string };
      if (e.skip) {
        // Provider not configured yet — reset backoff, keep it pending.
        await query(`UPDATE notifications SET next_attempt_at=now()+interval '1 hour',last_error=$2 WHERE id=$1`, [
          row.id,
          e.message ?? "no configurado",
        ]);
        result.skipped++;
        continue;
      }
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await query(`UPDATE notifications SET status='FAILED',attempts=$2,last_error=$3 WHERE id=$1`, [
          row.id,
          attempts,
          e.message ?? "error",
        ]);
        result.failed++;
      } else {
        const delay = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
        await query(
          `UPDATE notifications SET attempts=$2,last_error=$3,next_attempt_at=now()+($4||' minutes')::interval WHERE id=$1`,
          [row.id, attempts, e.message ?? "error", delay],
        );
        result.retry++;
      }
    }
  }

  return result;
}
