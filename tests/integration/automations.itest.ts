import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { hasDb, pool, migrate, reset } from "./setup";
import { runAutomations, previewRule, render, conditionsMatch } from "../../src/lib/automations";

const d = hasDb ? describe : describe.skip;

beforeAll(() => {
  if (hasDb) migrate();
});
beforeEach(async () => {
  if (hasDb) await reset();
});
afterAll(async () => {
  if (hasDb) await pool.end();
});

async function rule(overrides: Record<string, unknown>) {
  const base = {
    name: "R",
    event: "invoice.created",
    enabled: true,
    conditions: { all: [] as unknown[] },
    actions: [] as unknown[],
    ...overrides,
  };
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO automation_rules(name,event,enabled,conditions,actions)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING id`,
    [base.name, base.event, base.enabled, JSON.stringify(base.conditions), JSON.stringify(base.actions)],
  );
  return rows[0].id;
}

describe("automation predicates (no DB)", () => {
  it("interpolates templates and unknown fields become empty", () => {
    expect(render("Factura {{number}} por {{total}}", { number: "FAC-1", total: 500 })).toBe("Factura FAC-1 por 500");
    expect(render("{{missing}} x", {})).toBe(" x");
  });
  it("evaluates flat AND conditions", () => {
    const p = { total: 60000, fiscalType: "E31", clientName: "ACME" };
    expect(conditionsMatch(p, { all: [{ field: "total", op: "gte", value: "50000" }] })).toBe(true);
    expect(conditionsMatch(p, { all: [{ field: "total", op: "lt", value: "50000" }] })).toBe(false);
    expect(conditionsMatch(p, { all: [{ field: "clientName", op: "contains", value: "acm" }] })).toBe(true);
    expect(conditionsMatch(p, { all: [{ field: "fiscalType", op: "in", value: "E31, E32" }] })).toBe(true);
    expect(conditionsMatch(p, { all: [] })).toBe(true); // empty = always
  });
  it("previewRule reports match + planned actions without side effects", () => {
    const pv = previewRule(
      { event: "invoice.created", conditions: { all: [{ field: "total", op: "gte", value: "1000" }] }, actions: [{ type: "notify", to: "team", title: "Big one: {{number}}" }] },
      { number: "FAC-9", total: 5000 },
    );
    expect(pv.matched).toBe(true);
    expect(pv.plannedActions[0].summary).toContain("FAC-9");
  });
});

d("automation engine", () => {
  it("fires a matching rule, runs the notify action and logs the run", async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users(email,name,role,password_hash) VALUES ('fin@test.local','Fin','FINANCE','x') RETURNING id`,
    );
    await rule({
      conditions: { all: [{ field: "total", op: "gte", value: "50000" }] },
      actions: [{ type: "notify", to: "role:FINANCE", title: "Factura grande {{number}}", body: "{{total}}" }],
    });

    const hit = await runAutomations("invoice.created", { number: "FAC-2026-00001", total: 60000, clientId: null });
    expect(hit).toMatchObject({ evaluated: 1, fired: 1, actions: 1, errors: 0 });

    const notif = await pool.query(
      `SELECT title, body, category FROM notifications WHERE user_id=$1 AND channel='IN_APP'`,
      [u[0].id],
    );
    expect(notif.rows).toHaveLength(1);
    expect(notif.rows[0].title).toBe("Factura grande FAC-2026-00001");
    expect(notif.rows[0].body).toBe("60000");

    const runs = await pool.query(`SELECT status, result FROM automation_runs`);
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0].status).toBe("OK");

    const miss = await runAutomations("invoice.created", { number: "FAC-2026-00002", total: 10000, clientId: null });
    expect(miss).toMatchObject({ evaluated: 1, fired: 0 });
    expect((await pool.query(`SELECT count(*)::int n FROM automation_runs`)).rows[0].n).toBe(1);
  });

  it("skips disabled rules and rules for other events", async () => {
    await rule({ enabled: false, actions: [{ type: "notify", to: "team", title: "x" }] });
    await rule({ event: "ticket.created", actions: [{ type: "notify", to: "team", title: "x" }] });
    const r = await runAutomations("invoice.created", { total: 1, clientId: null });
    expect(r.evaluated).toBe(0);
    expect(r.fired).toBe(0);
  });

  it("queues an email action as a PENDING outbox row", async () => {
    await rule({ actions: [{ type: "email", to: "client", subject: "Gracias {{clientName}}", body: "hola" }] });
    await runAutomations("invoice.created", { clientName: "ACME", clientEmail: "ap@acme.do", total: 1, clientId: null });
    const mail = await pool.query(`SELECT status, channel, destination, title FROM notifications WHERE channel='EMAIL'`);
    expect(mail.rows[0]).toMatchObject({ status: "PENDING", destination: "ap@acme.do", title: "Gracias ACME" });
  });

  it("refuses a webhook to a private/metadata address and records the error", async () => {
    await rule({ actions: [{ type: "webhook", url: "http://169.254.169.254/latest/meta-data" }] });
    const r = await runAutomations("invoice.created", { total: 1, clientId: null });
    expect(r).toMatchObject({ fired: 1, errors: 1 });
    const run = (await pool.query(`SELECT status, result FROM automation_runs`)).rows[0];
    expect(run.status).toBe("ERROR");
    expect(JSON.stringify(run.result)).toContain("privado");
  });
});
