import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { hasDb, pool, migrate, reset, makeClient } from "./setup";
import { requestCsat, submitCsat, csatView, csatSummary } from "../../src/lib/csat";

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

const staff = { id: "00000000-0000-0000-0000-000000000000", role: "ADMIN", clientId: null } as never;

async function makeTicket(clientId: string, number = "SUP-2026-00001") {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO tickets(number,client_id,subject,description,priority,status)
     VALUES ($1,$2,'No carga','...','HIGH','RESOLVED') RETURNING id`,
    [number, clientId],
  );
  return rows[0].id;
}

d("csat", () => {
  it("requests a survey once, queues the email, and is idempotent", async () => {
    const clientId = await makeClient("Rated SRL");
    await pool.query(`UPDATE clients SET email='ops@rated.test' WHERE id=$1`, [clientId]);
    const ticketId = await makeTicket(clientId);

    const first = await requestCsat(ticketId);
    expect(first.requested).toBe(true);
    expect(first.token).toBeTruthy();

    const mail = await pool.query(`SELECT status, destination FROM notifications WHERE channel='EMAIL'`);
    expect(mail.rows).toHaveLength(1);
    expect(mail.rows[0]).toMatchObject({ status: "PENDING", destination: "ops@rated.test" });

    const second = await requestCsat(ticketId);
    expect(second.requested).toBe(false);
    expect(second.token).toBe(first.token);
    expect((await pool.query(`SELECT count(*)::int n FROM notifications WHERE channel='EMAIL'`)).rows[0].n).toBe(1);
  });

  it("does nothing when the client has no email", async () => {
    const clientId = await makeClient("Emailless SRL");
    const ticketId = await makeTicket(clientId);
    const r = await requestCsat(ticketId);
    expect(r).toEqual({ requested: false, token: null });
    expect((await pool.query(`SELECT csat_token FROM tickets WHERE id=$1`, [ticketId])).rows[0].csat_token).toBeNull();
  });

  it("accepts one submission and rejects a second", async () => {
    const clientId = await makeClient("Twice SRL");
    await pool.query(`UPDATE clients SET email='x@twice.test' WHERE id=$1`, [clientId]);
    const ticketId = await makeTicket(clientId);
    const { token } = await requestCsat(ticketId);

    const res = await submitCsat(token!, { score: 4, comment: "rápido y claro" });
    expect(res).toEqual({ status: "SUBMITTED", score: 4 });
    const row = (await pool.query(`SELECT csat_score, csat_comment, csat_submitted_at FROM tickets WHERE id=$1`, [ticketId])).rows[0];
    expect(row.csat_score).toBe(4);
    expect(row.csat_comment).toBe("rápido y claro");
    expect(row.csat_submitted_at).not.toBeNull();

    await expect(submitCsat(token!, { score: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(submitCsat("nonexistent-token", { score: 3 })).rejects.toMatchObject({ status: 404 });
  });

  it("a low score notifies the support leads; csatView reflects submitted state", async () => {
    await pool.query(`INSERT INTO users(email,name,role,password_hash) VALUES ('lead@test.local','Lead','SUPPORT','x')`);
    const clientId = await makeClient("Angry SRL");
    await pool.query(`UPDATE clients SET email='a@angry.test' WHERE id=$1`, [clientId]);
    const ticketId = await makeTicket(clientId);
    const { token } = await requestCsat(ticketId);

    await submitCsat(token!, { score: 1, comment: "muy lento" });

    const notif = await pool.query(`SELECT title, category FROM notifications WHERE channel='IN_APP'`);
    expect(notif.rows.some((n) => n.title.startsWith("CSAT 1/5") && n.category === "SUPPORT")).toBe(true);

    const view = await csatView(token!);
    expect(view).toMatchObject({ submitted: true, score: 1, company: "JFMCSS" });
  });

  it("csatSummary rolls up score, response rate and recent comments", async () => {
    const c1 = await makeClient("A SRL");
    const c2 = await makeClient("B SRL");
    await pool.query(`UPDATE clients SET email='e1@x.test' WHERE id=$1`, [c1]);
    await pool.query(`UPDATE clients SET email='e2@x.test' WHERE id=$1`, [c2]);
    const t1 = await makeTicket(c1, "SUP-2026-00001");
    const t2 = await makeTicket(c1, "SUP-2026-00002");
    const t3 = await makeTicket(c2, "SUP-2026-00003");
    const k1 = (await requestCsat(t1)).token!;
    const k2 = (await requestCsat(t2)).token!;
    await requestCsat(t3); // requested, never answered

    await submitCsat(k1, { score: 5, comment: "excelente" });
    await submitCsat(k2, { score: 3 });

    const sum = await csatSummary(staff);
    expect(sum).toMatchObject({ sent: 3, responses: 2, average: 4, responseRate: 66.7 });
    expect(sum.distribution).toMatchObject({ 3: 1, 5: 1 });
    expect(sum.recent.map((r) => r.number)).toContain("SUP-2026-00001");
  });
});
