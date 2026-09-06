import { query } from "./db";
import { sendEmail, notifyInApp } from "./notifications";
import { audit } from "./audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

type DunningStep = { key: string; offset: number; channels: string[]; label: string };
type DunningConfig = { enabled: boolean; minBalance: number; promiseGraceDays: number; steps: DunningStep[] };

const DEFAULT: DunningConfig = {
  enabled: true,
  minBalance: 0,
  promiseGraceDays: 2,
  steps: [
    { key: "preventive", offset: -3, channels: ["email"], label: "Recordatorio preventivo" },
    { key: "first", offset: 1, channels: ["email"], label: "Primer aviso de vencimiento" },
    { key: "second", offset: 7, channels: ["email", "inapp"], label: "Segundo aviso" },
    { key: "escalation", offset: 15, channels: ["inapp"], label: "Escalación interna" },
  ],
};

export async function dunningConfig(): Promise<DunningConfig> {
  const { rows } = await query<{ value: any }>(`SELECT value FROM settings WHERE key='dunning'`);
  const v = rows[0]?.value;
  if (!v || !Array.isArray(v.steps)) return DEFAULT;
  return {
    enabled: v.enabled !== false,
    minBalance: Number(v.minBalance) || 0,
    promiseGraceDays: Number(v.promiseGraceDays) || 2,
    steps: v.steps,
  };
}

const rd = (n: number) => `RD$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

function emailBody(step: DunningStep, inv: any, balance: number, overdueDays: number): { subject: string; html: string } {
  const portal = `${process.env.APP_URL || ""}`;
  const common = `<p>Balance pendiente: <strong>${rd(balance)}</strong>${
    inv.ncf ? ` · NCF ${inv.ncf}` : ""
  }.</p><p>Puedes ver la factura y realizar el pago desde tu portal JFMCSS: <a href="${portal}">${portal}</a>.</p>`;
  if (step.offset < 0) {
    return {
      subject: `Recordatorio: factura ${inv.number} vence pronto`,
      html: `<p>Hola ${inv.client_name},</p><p>Tu factura <strong>${inv.number}</strong> vence el ${String(inv.due_text).slice(0, 10)}.</p>${common}`,
    };
  }
  if (overdueDays <= 3) {
    return {
      subject: `Factura ${inv.number} vencida`,
      html: `<p>Hola ${inv.client_name},</p><p>Tu factura <strong>${inv.number}</strong> venció hace ${overdueDays} día(s).</p>${common}<p>Si ya realizaste el pago, ignora este mensaje.</p>`,
    };
  }
  return {
    subject: `2º aviso · factura ${inv.number} vencida hace ${overdueDays} días`,
    html: `<p>Hola ${inv.client_name},</p><p>La factura <strong>${inv.number}</strong> continúa pendiente (${overdueDays} días de mora).</p>${common}<p>Para acordar un plan de pago, responde a este correo.</p>`,
  };
}

export type DunningResult = { evaluated: number; remindersSent: number; escalations: number; skippedPromise: number };

/**
 * Walks every open invoice through the configured dunning steps. Each step fires
 * at most once per invoice (recorded in `dunning_log`); a future `promise_date`
 * (+ grace) pauses the sequence. Safe to run daily / repeatedly.
 */
export async function runDunning(actorId: string | null = null): Promise<DunningResult> {
  const result: DunningResult = { evaluated: 0, remindersSent: 0, escalations: 0, skippedPromise: 0 };
  const cfg = await dunningConfig();
  if (!cfg.enabled) return result;

  const today = new Date();
  const team = (
    await query<{ id: string }>(`SELECT id FROM users WHERE active=true AND role IN ('SUPER_ADMIN','ADMIN','FINANCE')`)
  ).rows;

  const { rows: invoices } = await query<any>(
    `SELECT i.id, i.number, i.ncf, i.total, i.paid_amount, i.dunning_log,
            i.due_date::text     due_text,
            i.promise_date::text promise_text,
            c.name client_name, c.email client_email, i.client_id
       FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.document_kind = 'INVOICE'
        AND i.status IN ('ISSUED','PARTIAL','OVERDUE')
        AND i.due_date IS NOT NULL
        AND (i.total - i.paid_amount) > $1`,
    [cfg.minBalance],
  );

  for (const inv of invoices) {
    result.evaluated++;
    const balance = Number(inv.total) - Number(inv.paid_amount);
    const due = new Date(inv.due_text + "T12:00:00Z");
    const overdueDays = daysBetween(today, due);

    if (inv.promise_text) {
      const graceEnd = new Date(inv.promise_text + "T12:00:00Z");
      graceEnd.setUTCDate(graceEnd.getUTCDate() + cfg.promiseGraceDays);
      if (today < graceEnd) {
        result.skippedPromise++;
        continue;
      }
    }

    const done: string[] = (inv.dunning_log || []).map((d: any) => d.step);
    // Highest-offset step already sent — earlier steps behind it are superseded,
    // never re-fired. We only advance forward through the cadence.
    const sentOffsets = done
      .map((k) => cfg.steps.find((s) => s.key === k)?.offset)
      .filter((n): n is number => typeof n === "number");
    const maxSent = sentOffsets.length ? Math.max(...sentOffsets) : -Infinity;
    // Fire the latest due step that hasn't run yet and sits ahead of the cadence.
    const pending = cfg.steps
      .filter((s) => overdueDays >= s.offset && !done.includes(s.key) && s.offset > maxSent)
      .sort((a, b) => b.offset - a.offset);
    const step = pending[0];
    if (!step) continue;

    let sent = false;
    if (step.channels.includes("email") && inv.client_email) {
      const { subject, html } = emailBody(step, inv, balance, overdueDays);
      await sendEmail(inv.client_email, `${subject} · JFMCSS`, html, inv.client_id);
      sent = true;
    }
    if (step.channels.includes("inapp")) {
      const msg =
        step.key === "escalation"
          ? `Escalación de cobro: ${inv.client_name} · ${inv.number} · ${rd(balance)} · ${overdueDays}d de mora`
          : `Cobro ${inv.number}: ${step.label} enviado a ${inv.client_name}`;
      for (const u of team) await notifyInApp(u.id, msg, `${rd(balance)} pendiente`, inv.client_id, { invoiceId: inv.id });
      sent = true;
      if (step.key === "escalation") result.escalations++;
    }

    if (sent) {
      await query(
        `UPDATE invoices SET dunning_log = dunning_log || $2::jsonb, updated_at = now() WHERE id = $1`,
        [inv.id, JSON.stringify([{ step: step.key, sentAt: new Date().toISOString(), overdueDays }])],
      );
      result.remindersSent++;
    }
  }

  if (result.remindersSent > 0) await audit(actorId, "DUNNING_RUN", "SYSTEM", null, result);
  return result;
}
