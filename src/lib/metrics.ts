/**
 * Prometheus metrics without a client library. In-process counters (bumped by
 * the HTTP envelope helpers) plus business/infra gauges sampled from the DB on
 * each scrape. Exposition text is built in `renderMetrics()`, served by
 * `/api/metrics`.
 *
 * `./db` is imported lazily so the lightweight counter path can be pulled into
 * `http.ts` without dragging `pg` into pure-unit test files.
 */

const counters = new Map<string, number>();

/** counter key = name + sorted label set, e.g. `api_responses_total{class="2xx"}` */
function key(name: string, labels: Record<string, string>) {
  const l = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v.replace(/[\\"\n]/g, "_")}"`)
    .join(",");
  return l ? `${name}{${l}}` : name;
}

export function inc(name: string, labels: Record<string, string> = {}, by = 1) {
  const k = key(name, labels);
  counters.set(k, (counters.get(k) ?? 0) + by);
}

/** Record one API response by status class (called from `ok`/`fail`/`apiError`). */
export function recordApiResponse(status: number) {
  const cls = `${Math.floor(status / 100)}xx`;
  inc("jfmcss_api_responses_total", { class: cls });
}

type Gauge = { name: string; help: string; value: number; labels?: Record<string, string> };

async function sampleGauges(): Promise<Gauge[]> {
  const { pool, query } = await import("./db");
  const out: Gauge[] = [];
  const num = (v: unknown) => Number(v ?? 0);

  const g = (name: string, help: string, value: number, labels?: Record<string, string>) =>
    out.push({ name, help, value, labels });

  try {
    const r = (
      await query<Record<string, string>>(`
      SELECT
        (SELECT coalesce(sum(total-paid_amount),0) FROM invoices WHERE status IN ('ISSUED','PARTIAL','OVERDUE')) outstanding,
        (SELECT coalesce(sum(total-paid_amount),0) FROM invoices WHERE due_date < CURRENT_DATE AND status IN ('ISSUED','PARTIAL','OVERDUE')) overdue,
        (SELECT count(*) FROM tickets WHERE status NOT IN ('RESOLVED','CLOSED')) tickets_open,
        (SELECT count(*) FROM tickets WHERE resolution_due_at < now() AND status NOT IN ('RESOLVED','CLOSED')) tickets_breached,
        (SELECT count(*) FROM notifications WHERE status='PENDING' AND channel IN ('EMAIL','WHATSAPP')) outbox_pending,
        (SELECT count(*) FROM notifications WHERE status='FAILED') outbox_failed,
        (SELECT count(*) FROM users WHERE active=true) users_active,
        (SELECT count(*) FROM sessions WHERE expires_at > now()) sessions_active,
        (SELECT count(*) FROM users WHERE mfa_enabled=true) mfa_users,
        (SELECT count(*) FROM automation_runs WHERE status='ERROR' AND created_at > now()-interval '24 hours') automation_errors_24h,
        (SELECT count(*) FROM automation_rules WHERE enabled=true) automation_rules_enabled
    `)
    ).rows[0];
    g("jfmcss_invoices_outstanding_amount", "Unpaid invoice balance (DOP)", num(r.outstanding));
    g("jfmcss_invoices_overdue_amount", "Overdue invoice balance (DOP)", num(r.overdue));
    g("jfmcss_tickets_open", "Open support tickets", num(r.tickets_open));
    g("jfmcss_tickets_sla_breached", "Open tickets past their resolution SLA", num(r.tickets_breached));
    g("jfmcss_notifications_outbox_pending", "EMAIL/WHATSAPP notifications awaiting delivery", num(r.outbox_pending));
    g("jfmcss_notifications_outbox_failed", "Notifications that exhausted retries", num(r.outbox_failed));
    g("jfmcss_users_active", "Active user accounts", num(r.users_active));
    g("jfmcss_users_mfa_enabled", "Users with TOTP MFA enabled", num(r.mfa_users));
    g("jfmcss_sessions_active", "Unexpired sessions", num(r.sessions_active));
    g("jfmcss_automation_runs_errors_24h", "Automation runs that errored in the last 24h", num(r.automation_errors_24h));
    g("jfmcss_automation_rules_enabled", "Enabled automation rules", num(r.automation_rules_enabled));
    g("jfmcss_db_up", "1 when the database query succeeded", 1);
  } catch {
    g("jfmcss_db_up", "1 when the database query succeeded", 0);
  }

  // Pool + process
  const p = pool as unknown as { totalCount?: number; idleCount?: number; waitingCount?: number };
  g("jfmcss_db_pool_total", "pg pool total clients", p.totalCount ?? 0);
  g("jfmcss_db_pool_idle", "pg pool idle clients", p.idleCount ?? 0);
  g("jfmcss_db_pool_waiting", "requests waiting for a pool client", p.waitingCount ?? 0);
  const mem = process.memoryUsage();
  g("jfmcss_process_resident_memory_bytes", "resident set size", mem.rss);
  g("jfmcss_process_heap_used_bytes", "V8 heap used", mem.heapUsed);
  g("jfmcss_process_uptime_seconds", "process uptime", Math.round(process.uptime()));
  return out;
}

export async function renderMetrics(): Promise<string> {
  const lines: string[] = [];

  // Counters
  const byName = new Map<string, string[]>();
  for (const [k] of counters) {
    const name = k.split("{")[0];
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(k);
  }
  for (const [name, keys] of byName) {
    lines.push(`# TYPE ${name} counter`);
    for (const k of keys) lines.push(`${k} ${counters.get(k)}`);
  }

  // Gauges
  for (const gauge of await sampleGauges()) {
    lines.push(`# HELP ${gauge.name} ${gauge.help}`);
    lines.push(`# TYPE ${gauge.name} gauge`);
    lines.push(`${key(gauge.name, gauge.labels ?? {})} ${gauge.value}`);
  }

  lines.push(`# TYPE jfmcss_build_info gauge`);
  lines.push(`jfmcss_build_info{version="${process.env.APP_VERSION || "dev"}"} 1`);

  return lines.join("\n") + "\n";
}
