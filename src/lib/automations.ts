import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { query } from "./db";
import { sendEmail, notifyInApp } from "./notifications";
import { log } from "./log";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * WHEN / IF / DO automation engine.
 *
 *   WHEN  a domain event fires (`runAutomations(event, payload)`)
 *   IF    every condition matches the event payload (flat AND)
 *   DO    run each action (notify / email / webhook)
 *
 * `runAutomations` is called fire-and-forget from the emit points and must never
 * throw into the triggering request — every failure is captured in
 * `automation_runs` instead, which is what the Automatizaciones page shows.
 */

// ─── catalog: what the rule builder offers ─────────────────────────────────

export type EventField = { key: string; label: string; type: "string" | "number" | "money" | "date" };
export type EventDef = { event: string; label: string; fields: EventField[]; sample: Record<string, unknown> };

const money = (n: number) => n;
export const EVENTS: EventDef[] = [
  {
    event: "invoice.created",
    label: "Factura emitida",
    fields: [
      { key: "number", label: "Número", type: "string" },
      { key: "total", label: "Total", type: "money" },
      { key: "fiscalType", label: "Tipo fiscal", type: "string" },
      { key: "clientName", label: "Cliente", type: "string" },
      { key: "source", label: "Origen", type: "string" },
    ],
    sample: { number: "FAC-2026-00001", total: money(59000), fiscalType: "E31", clientName: "ACME SRL", clientEmail: "pagos@acme.do", source: "MANUAL", clientId: "" },
  },
  {
    event: "invoice.paid",
    label: "Factura pagada por completo",
    fields: [
      { key: "number", label: "Número", type: "string" },
      { key: "total", label: "Total", type: "money" },
      { key: "clientName", label: "Cliente", type: "string" },
    ],
    sample: { number: "FAC-2026-00001", total: money(59000), clientName: "ACME SRL", clientEmail: "pagos@acme.do", clientId: "" },
  },
  {
    event: "payment.received",
    label: "Pago registrado",
    fields: [
      { key: "amount", label: "Monto", type: "money" },
      { key: "method", label: "Método", type: "string" },
      { key: "invoiceNumber", label: "Factura", type: "string" },
      { key: "clientName", label: "Cliente", type: "string" },
    ],
    sample: { amount: money(59000), method: "TRANSFER", invoiceNumber: "FAC-2026-00001", clientName: "ACME SRL", clientEmail: "pagos@acme.do", clientId: "" },
  },
  {
    event: "ticket.created",
    label: "Ticket de soporte creado",
    fields: [
      { key: "number", label: "Número", type: "string" },
      { key: "priority", label: "Prioridad", type: "string" },
      { key: "subject", label: "Asunto", type: "string" },
      { key: "clientName", label: "Cliente", type: "string" },
    ],
    sample: { number: "SUP-2026-00001", priority: "HIGH", subject: "No carga el panel", clientName: "ACME SRL", clientEmail: "soporte@acme.do", clientId: "" },
  },
  {
    event: "ticket.resolved",
    label: "Ticket resuelto",
    fields: [
      { key: "number", label: "Número", type: "string" },
      { key: "priority", label: "Prioridad", type: "string" },
      { key: "subject", label: "Asunto", type: "string" },
      { key: "clientName", label: "Cliente", type: "string" },
    ],
    sample: { number: "SUP-2026-00001", priority: "HIGH", subject: "No carga el panel", clientName: "ACME SRL", clientEmail: "soporte@acme.do", clientId: "" },
  },
  {
    event: "ticket.csat_received",
    label: "Encuesta de satisfacción respondida",
    fields: [
      { key: "score", label: "Puntuación (1-5)", type: "number" },
      { key: "comment", label: "Comentario", type: "string" },
      { key: "number", label: "Ticket", type: "string" },
      { key: "priority", label: "Prioridad", type: "string" },
      { key: "clientName", label: "Cliente", type: "string" },
    ],
    sample: { score: 2, comment: "Tardaron demasiado en responder", number: "SUP-2026-00001", priority: "HIGH", subject: "No carga el panel", clientName: "ACME SRL", clientId: "" },
  },
  {
    event: "proposal.accepted",
    label: "Propuesta aceptada",
    fields: [
      { key: "number", label: "Número", type: "string" },
      { key: "total", label: "Total", type: "money" },
      { key: "clientName", label: "Cliente", type: "string" },
      { key: "acceptedBy", label: "Aceptada por", type: "string" },
    ],
    sample: { number: "PRO-2026-00001", total: money(118000), clientName: "ACME SRL", clientEmail: "gerencia@acme.do", acceptedBy: "cliente", clientId: "" },
  },
  {
    event: "client.created",
    label: "Cliente creado",
    fields: [
      { key: "name", label: "Nombre", type: "string" },
      { key: "status", label: "Estado", type: "string" },
    ],
    sample: { name: "ACME SRL", status: "ACTIVE", clientEmail: "info@acme.do", clientId: "" },
  },
];
export const EVENT_KEYS = EVENTS.map((e) => e.event);

export const CONDITION_OPS = [
  { op: "eq", label: "es igual a" },
  { op: "ne", label: "no es igual a" },
  { op: "gt", label: "mayor que" },
  { op: "gte", label: "mayor o igual que" },
  { op: "lt", label: "menor que" },
  { op: "lte", label: "menor o igual que" },
  { op: "contains", label: "contiene" },
  { op: "in", label: "está en la lista (coma)" },
  { op: "not_empty", label: "tiene valor" },
  { op: "is_empty", label: "está vacío" },
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number]["op"];

export const ACTION_TYPES = [
  { type: "notify", label: "Notificación interna" },
  { type: "email", label: "Enviar correo" },
  { type: "webhook", label: "Llamar webhook (POST)" },
] as const;

export type Condition = { field: string; op: ConditionOp; value?: string };
export type Action =
  | { type: "notify"; to: string; title: string; body?: string }
  | { type: "email"; to: string; subject: string; body: string }
  | { type: "webhook"; url: string };
export type RuleConditions = { all?: Condition[] };

export function automationCatalog() {
  return { events: EVENTS, ops: CONDITION_OPS, actionTypes: ACTION_TYPES };
}

// ─── condition evaluation ─────────────────────────────────────────────────

const getPath = (obj: any, path: string) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

function matchOne(payload: any, c: Condition): boolean {
  const actual = getPath(payload, c.field);
  const raw = c.value ?? "";
  switch (c.op) {
    case "not_empty":
      return actual != null && actual !== "";
    case "is_empty":
      return actual == null || actual === "";
    case "eq":
      return String(actual) === raw;
    case "ne":
      return String(actual) !== raw;
    case "contains":
      return String(actual ?? "").toLowerCase().includes(raw.toLowerCase());
    case "in":
      return raw
        .split(",")
        .map((s) => s.trim())
        .includes(String(actual));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = Number(actual);
      const b = Number(raw);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return c.op === "gt" ? a > b : c.op === "gte" ? a >= b : c.op === "lt" ? a < b : a <= b;
    }
    default:
      return false;
  }
}

export function conditionsMatch(payload: any, conditions: RuleConditions | null | undefined): boolean {
  const all = Array.isArray(conditions?.all) ? conditions!.all! : [];
  return all.every((c) => matchOne(payload, c));
}

// ─── template interpolation ──────────────────────────────────────────────

/** `{{field}}` → payload value; unknown fields become an empty string. */
export function render(template: string, payload: any): string {
  return String(template ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = getPath(payload, k);
    return v == null ? "" : String(v);
  });
}

// ─── webhook SSRF guard ──────────────────────────────────────────────────

function isBlockedIp(ip: string): boolean {
  if (ip === "0.0.0.0" || ip === "::" || ip === "::1") return true;
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80") || lower.startsWith("::ffff:127.");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL inválida");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("solo http/https");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error("destino privado no permitido");
    return url;
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("destino privado no permitido");
  const records = await lookup(host, { all: true }).catch(() => [] as { address: string }[]);
  if (!records.length) throw new Error("no se pudo resolver el host");
  if (records.some((r) => isBlockedIp(r.address))) throw new Error("destino privado no permitido");
  return url;
}

// ─── action execution ────────────────────────────────────────────────────

async function resolveRecipients(to: string): Promise<string[]> {
  if (to.startsWith("user:")) return [to.slice(5)];
  if (to.startsWith("role:")) {
    const role = to.slice(5).toUpperCase();
    const { rows } = await query<{ id: string }>(`SELECT id FROM users WHERE active=true AND role=$1`, [role]);
    return rows.map((r) => r.id);
  }
  // default: every active staff member
  const { rows } = await query<{ id: string }>(`SELECT id FROM users WHERE active=true AND role<>'CLIENT'`);
  return rows.map((r) => r.id);
}

async function runAction(action: Action, payload: any): Promise<string> {
  if (action.type === "notify") {
    const ids = await resolveRecipients(action.to || "");
    const title = render(action.title || "Automatización", payload).slice(0, 200);
    const body = render(action.body || "", payload).slice(0, 500);
    for (const id of ids) await notifyInApp(id, title, body, payload.clientId || null, { automation: true }, "SYSTEM");
    return `notify → ${ids.length} usuario(s)`;
  }
  if (action.type === "email") {
    const target = action.to === "client" ? payload.clientEmail : action.to;
    if (!target) return "email omitido (sin destinatario)";
    const subject = render(action.subject || "JFMCSS", payload).slice(0, 200);
    const html = `<p>${render(action.body || "", payload).replace(/\n/g, "<br>")}</p>`;
    await sendEmail(String(target), subject, html, payload.clientId || null);
    return `email → ${target}`;
  }
  if (action.type === "webhook") {
    const url = await assertPublicUrl(action.url);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "JFMCSS-Control/automations" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(process.env.AUTOMATION_WEBHOOK_TIMEOUT_MS || 5000)),
    });
    if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
    return `webhook → ${url.host} ${res.status}`;
  }
  return "acción desconocida";
}

// ─── engine entrypoint ───────────────────────────────────────────────────

export type AutomationOutcome = { event: string; evaluated: number; fired: number; actions: number; errors: number };

export async function runAutomations(event: string, payload: Record<string, unknown>): Promise<AutomationOutcome> {
  const outcome: AutomationOutcome = { event, evaluated: 0, fired: 0, actions: 0, errors: 0 };
  const { rows: rules } = await query<any>(
    `SELECT id,name,conditions,actions FROM automation_rules WHERE enabled=true AND event=$1`,
    [event],
  );
  for (const rule of rules) {
    outcome.evaluated++;
    let matched = false;
    try {
      matched = conditionsMatch(payload, rule.conditions);
    } catch {
      matched = false;
    }
    if (!matched) continue;
    outcome.fired++;

    const results: { action: string; ok: boolean; detail: string }[] = [];
    const actions: Action[] = Array.isArray(rule.actions) ? rule.actions : [];
    for (const action of actions) {
      try {
        const detail = await runAction(action, payload);
        results.push({ action: action.type, ok: true, detail });
        outcome.actions++;
      } catch (err) {
        results.push({ action: action.type, ok: false, detail: (err as Error).message });
        outcome.errors++;
      }
    }
    const failed = results.some((r) => !r.ok);
    await query(
      `INSERT INTO automation_runs(rule_id,event,matched,status,result,payload)
       VALUES($1,$2,true,$3,$4::jsonb,$5::jsonb)`,
      [rule.id, event, failed ? "ERROR" : "OK", JSON.stringify(results), JSON.stringify(payload)],
    );
    await query(`UPDATE automation_rules SET last_run_at=now() WHERE id=$1`, [rule.id]);
  }
  return outcome;
}

/** Never let an automation failure surface in the triggering request. */
export function fireAutomations(event: string, payload: Record<string, unknown>): void {
  void runAutomations(event, payload).catch((err) => {
    log.error("automation dispatch failed", err, { event });
  });
}

/** Dry run for the rule builder — evaluates + lists planned actions, no side effects. */
export function previewRule(
  rule: { event: string; conditions?: RuleConditions; actions?: Action[] },
  payload: Record<string, unknown>,
) {
  const matched = conditionsMatch(payload, rule.conditions);
  const planned = (rule.actions ?? []).map((a) => {
    if (a.type === "notify") return { type: a.type, summary: `Notificar a ${a.to || "equipo"}: “${render(a.title || "", payload)}”` };
    if (a.type === "email") return { type: a.type, summary: `Correo a ${a.to === "client" ? payload["clientEmail"] || "cliente" : a.to}: “${render(a.subject || "", payload)}”` };
    if (a.type === "webhook") return { type: a.type, summary: `POST ${a.url}` };
    return { type: (a as any).type, summary: "—" };
  });
  return { matched, plannedActions: matched ? planned : [] };
}
