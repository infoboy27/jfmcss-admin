import { query } from "./db";
import { notifyInAppOnce } from "./notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type SlaTarget = { firstResponse: number; resolution: number }; // hours

const FALLBACK: Record<Priority, SlaTarget> = {
  LOW: { firstResponse: 8, resolution: 48 },
  MEDIUM: { firstResponse: 4, resolution: 24 },
  HIGH: { firstResponse: 1, resolution: 8 },
  URGENT: { firstResponse: 0.25, resolution: 4 },
};

/** Reads `sla_v2`, falling back to the legacy `sla` (resolution-hours only). */
export async function slaConfig(): Promise<Record<Priority, SlaTarget>> {
  const { rows } = await query<{ key: string; value: any }>(
    `SELECT key, value FROM settings WHERE key IN ('sla_v2', 'sla')`,
  );
  const v2 = rows.find((r) => r.key === "sla_v2")?.value;
  const legacy = rows.find((r) => r.key === "sla")?.value;
  const out = {} as Record<Priority, SlaTarget>;
  for (const p of ["LOW", "MEDIUM", "HIGH", "URGENT"] as Priority[]) {
    if (v2?.[p]?.resolution) {
      out[p] = { firstResponse: Number(v2[p].firstResponse) || FALLBACK[p].firstResponse, resolution: Number(v2[p].resolution) };
    } else if (legacy?.[p]) {
      const res = Number(legacy[p]);
      out[p] = { firstResponse: Math.max(0.25, Math.round(res / 6)), resolution: res };
    } else {
      out[p] = FALLBACK[p];
    }
  }
  return out;
}

export function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 3_600_000);
}

type TicketSla = {
  status: string;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  sla_paused_seconds: number;
  sla_paused_at: string | null;
};

/** Percent of the target consumed (0–100+) and whether it's breached. */
function clockState(now: number, dueAtIso: string | null, startedAtIso: string, pausedSec: number, doneAtIso: string | null) {
  if (!dueAtIso) return { pct: 0, breached: false, remainingMs: Infinity, done: Boolean(doneAtIso) };
  const started = new Date(startedAtIso).getTime();
  const due = new Date(dueAtIso).getTime() + pausedSec * 1000;
  const endpoint = doneAtIso ? new Date(doneAtIso).getTime() : now;
  const total = due - started;
  const used = endpoint - started;
  const pct = total > 0 ? Math.round((used / total) * 100) : 100;
  return { pct, breached: !doneAtIso && endpoint > due, remainingMs: due - now, done: Boolean(doneAtIso) };
}

export function slaSnapshot(t: TicketSla, now = Date.now()) {
  const open = !["RESOLVED", "CLOSED"].includes(t.status);
  const pausedSec = t.sla_paused_seconds + (t.sla_paused_at ? Math.floor((now - new Date(t.sla_paused_at).getTime()) / 1000) : 0);
  return {
    open,
    paused: Boolean(t.sla_paused_at),
    firstResponse: clockState(now, t.first_response_due_at, t.created_at, pausedSec, t.first_response_at),
    resolution: clockState(now, t.resolution_due_at, t.created_at, pausedSec, t.resolved_at),
  };
}

const ALERT_THRESHOLDS = [50, 75, 90, 100];

export type SlaRunResult = { checked: number; alerts: number; escalated: number; breaches: number };

/**
 * Threshold alerts (50/75/90/100 %), escalation at ≥90 %, and breach flagging
 * for every open ticket. Idempotent — each alert is recorded in `sla_alerts` and
 * only fires once; notifications are additionally deduped for 20 h.
 */
export async function runSlaChecks(): Promise<SlaRunResult> {
  const result: SlaRunResult = { checked: 0, alerts: 0, escalated: 0, breaches: 0 };
  const now = Date.now();

  const { rows } = await query<any>(
    `SELECT t.*, c.name client_name
       FROM tickets t JOIN clients c ON c.id = t.client_id
      WHERE t.status NOT IN ('RESOLVED', 'CLOSED')`,
  );
  const admins = (
    await query<{ id: string }>(`SELECT id FROM users WHERE active=true AND role IN ('SUPER_ADMIN','ADMIN','SUPPORT')`)
  ).rows;

  for (const t of rows) {
    result.checked++;
    const snap = slaSnapshot(t, now);
    const alerts: Record<string, number[]> = t.sla_alerts || {};
    let dirty = false;
    let escalate = t.escalation_level;

    for (const [kind, clock] of [
      ["firstResponse", snap.firstResponse],
      ["resolution", snap.resolution],
    ] as const) {
      if (clock.done || !t[kind === "firstResponse" ? "first_response_due_at" : "resolution_due_at"]) continue;
      const fired: number[] = alerts[kind] || [];
      for (const th of ALERT_THRESHOLDS) {
        if (clock.pct >= th && !fired.includes(th)) {
          fired.push(th);
          dirty = true;
          const label = kind === "firstResponse" ? "1ª respuesta" : "resolución";
          const msg =
            th >= 100
              ? `SLA de ${label} INCUMPLIDO en ${t.number}`
              : `SLA de ${label} al ${th}% en ${t.number}`;
          for (const a of admins) {
            await notifyInAppOnce(a.id, `sla:${t.id}:${kind}:${th}`, msg, `${t.client_name} · ${t.subject}`, t.client_id);
          }
          result.alerts++;
          if (th >= 90 && escalate < 1) {
            escalate = 1;
            result.escalated++;
          }
          if (th >= 100) result.breaches++;
        }
      }
      alerts[kind] = fired;
    }

    const updates: string[] = [];
    const params: any[] = [t.id];
    if (dirty) {
      params.push(JSON.stringify(alerts));
      updates.push(`sla_alerts = $${params.length}`);
    }
    if (snap.firstResponse.breached && !t.first_response_breached) updates.push(`first_response_breached = true`);
    if (snap.resolution.breached && !t.resolution_breached) updates.push(`resolution_breached = true`);
    if (escalate !== t.escalation_level) {
      params.push(escalate);
      updates.push(`escalation_level = $${params.length}`);
    }
    if (updates.length) await query(`UPDATE tickets SET ${updates.join(", ")}, updated_at=now() WHERE id = $1`, params);
  }

  return result;
}
