import nodemailer from "nodemailer";
import { query } from "./db";

async function insertNotification(input: { userId?: string | null; clientId?: string | null; channel: "IN_APP"|"EMAIL"|"WHATSAPP"; title: string; body: string; destination?: string | null; metadata?: unknown }) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO notifications(user_id,client_id,channel,title,body,destination,metadata) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.userId || null, input.clientId || null, input.channel, input.title, input.body, input.destination || null, JSON.stringify(input.metadata || {})],
  );
  return rows[0]?.id;
}

export async function notifyInApp(userId: string | null, title: string, body: string, clientId?: string | null, metadata?: unknown) {
  const id = await insertNotification({ userId, clientId, channel: "IN_APP", title, body, metadata });
  await query(`UPDATE notifications SET status='SENT',sent_at=now() WHERE id=$1`, [id]);
  return id;
}

export async function sendEmail(to: string, subject: string, html: string, clientId?: string | null) {
  const id = await insertNotification({ clientId, channel: "EMAIL", title: subject, body: html.replace(/<[^>]*>/g, " ").slice(0, 4000), destination: to });
  if (!process.env.SMTP_HOST) return { id, status: "PENDING_CONFIGURATION" };
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      // Don't let an unreachable relay hang the request thread.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transporter.sendMail({ from: process.env.SMTP_FROM || "JFMCSS <notificaciones@jfmcss.com>", to, subject, html });
    await query(`UPDATE notifications SET status='SENT',sent_at=now() WHERE id=$1`, [id]);
    return { id, status: "SENT" };
  } catch (error) {
    await query(`UPDATE notifications SET status='FAILED',metadata=metadata || $2::jsonb WHERE id=$1`, [id, JSON.stringify({ error: String(error) })]);
    throw error;
  }
}

export async function sendWhatsApp(to: string, body: string, clientId?: string | null) {
  const id = await insertNotification({ clientId, channel: "WHATSAPP", title: "WhatsApp", body, destination: to });
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { id, status: "PENDING_CONFIGURATION" };
  const response = await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    signal: AbortSignal.timeout(Number(process.env.WHATSAPP_TIMEOUT_MS || 15_000)),
  });
  await query(`UPDATE notifications SET status=$2,sent_at=CASE WHEN $2='SENT' THEN now() ELSE sent_at END WHERE id=$1`, [id, response.ok ? "SENT" : "FAILED"]);
  if (!response.ok) throw new Error(`WhatsApp API ${response.status}`);
  return { id, status: "SENT" };
}
