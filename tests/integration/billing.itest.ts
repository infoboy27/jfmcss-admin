import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { hasDb, pool, migrate, reset, makeClient } from "./setup";
import { allocateFiscalNumber } from "../../src/lib/fiscal";
import { runRecurringBilling } from "../../src/lib/recurring";
import { convertProposal } from "../../src/lib/proposals";
import { invoiceSupportTime } from "../../src/lib/support-billing";

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

d("fiscal sequence allocation under concurrency", () => {
  it("hands every concurrent caller a distinct, gapless number", async () => {
    const N = 25;
    const results = await Promise.all(
      Array.from({ length: N }, async () => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const ncf = await allocateFiscalNumber(c, "E31");
          await c.query("COMMIT");
          return ncf;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      }),
    );
    const unique = new Set(results);
    expect(unique.size).toBe(N);
    const nums = [...results].map((r) => Number(r.replace(/^E31/, ""))).sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    const { rows } = await pool.query(`SELECT next_number FROM fiscal_sequences WHERE document_type='E31'`);
    expect(Number(rows[0].next_number)).toBe(N + 1);
  });
});

d("recurring billing idempotency", () => {
  it("bills a due service exactly once even if the cron runs twice", async () => {
    const clientId = await makeClient();
    await pool.query(
      `INSERT INTO assets(client_id,type,name,recurring_price,billing_cycle,auto_invoice,next_invoice_date,fiscal_type)
       VALUES ($1,'SAAS','Hosting Business',5000,'MONTHLY',true,CURRENT_DATE,'E31')`,
      [clientId],
    );

    const first = await runRecurringBilling();
    const second = await runRecurringBilling();

    expect(first.invoiced).toBe(1);
    expect(second.invoiced).toBe(0);

    const { rows: invoices } = await pool.query(`SELECT total, tax, subtotal FROM invoices WHERE asset_id IS NOT NULL`);
    expect(invoices).toHaveLength(1);
    expect(Number(invoices[0].subtotal)).toBe(5000);
    expect(Number(invoices[0].tax)).toBe(900); // 18% of 5000
    expect(Number(invoices[0].total)).toBe(5900);

    const { rows: asset } = await pool.query(`SELECT next_invoice_date FROM assets`);
    const next = new Date(asset[0].next_invoice_date);
    expect(next.getUTCMonth()).toBe((new Date().getUTCMonth() + 1) % 12);
  });
});

d("proposal → project conversion", () => {
  it("creates a linked project, marks the opportunity WON, and refuses a second conversion", async () => {
    const clientId = await makeClient();
    const opp = await pool.query<{ id: string }>(
      `INSERT INTO opportunities(client_id,title,stage,amount) VALUES ($1,'Deal','PROPOSAL',100000) RETURNING id`,
      [clientId],
    );
    const prop = await pool.query<{ id: string }>(
      `INSERT INTO proposals(number,client_id,opportunity_id,title,subtotal,tax,total,status)
       VALUES ('PRO-2026-00001',$1,$2,'Portal',100000,18000,118000,'SENT') RETURNING id`,
      [clientId, opp.rows[0].id],
    );
    await pool.query(
      `INSERT INTO proposal_items(proposal_id,description,line_total) VALUES ($1,'Desarrollo',118000)`,
      [prop.rows[0].id],
    );
    await pool.query(
      `INSERT INTO proposal_milestones(proposal_id,label,percentage,amount,position) VALUES ($1,'Inicio',50,59000,0)`,
      [prop.rows[0].id],
    );

    const outcome = await convertProposal(prop.rows[0].id, null, { note: null, createInitialInvoice: true });

    expect(outcome.project.id).toBeTruthy();
    const { rows: p } = await pool.query(`SELECT status, project_id FROM proposals WHERE id=$1`, [prop.rows[0].id]);
    expect(p[0].status).toBe("ACCEPTED");
    expect(p[0].project_id).toBe(outcome.project.id);

    const { rows: o } = await pool.query(`SELECT stage FROM opportunities WHERE id=$1`, [opp.rows[0].id]);
    expect(o[0].stage).toBe("WON");

    // Initial invoice: milestone 59000 gross → split back to 50000 + 9000 ITBIS.
    const { rows: inv } = await pool.query(`SELECT subtotal, tax, total FROM invoices WHERE proposal_id=$1`, [prop.rows[0].id]);
    expect(inv).toHaveLength(1);
    expect(Number(inv[0].total)).toBe(59000);
    expect(Number(inv[0].subtotal)).toBe(50000);
    expect(Number(inv[0].tax)).toBe(9000);

    await expect(convertProposal(prop.rows[0].id, null, { note: null, createInitialInvoice: false })).rejects.toThrow(/convertida/);
  });
});

d("billable support → invoice", () => {
  it("rolls unbilled time into one invoice, stamps the entries, and won't double-bill", async () => {
    const clientId = await makeClient();
    const t = await pool.query<{ id: string }>(
      `INSERT INTO tickets(number,client_id,subject,description,priority)
       VALUES ('SUP-2026-00001',$1,'Bug','...','HIGH') RETURNING id`,
      [clientId],
    );
    await pool.query(
      `INSERT INTO ticket_time_entries(ticket_id,minutes,billable) VALUES ($1,45,true),($1,75,true),($1,30,false)`,
      [t.rows[0].id],
    );

    const first = await invoiceSupportTime(clientId, null, { hourlyRate: 2000, issue: true, perTicket: false });
    expect(first.minutes).toBe(120); // only the billable 45 + 75
    expect(first.billedEntries).toBe(2);
    // 2h @ 2000 = 4000 subtotal, +18% = 4720
    expect(Number(first.invoice.subtotal)).toBe(4000);
    expect(Number(first.invoice.total)).toBe(4720);
    expect(first.invoice.source).toBe("SUPPORT");
    expect(first.invoice.ncf).toMatch(/^E31/);

    // Entries are now stamped — a second run finds nothing.
    await expect(invoiceSupportTime(clientId, null, {})).rejects.toThrow(/sin facturar/i);

    const { rows } = await pool.query(`SELECT count(*)::int n FROM ticket_time_entries WHERE invoice_id IS NOT NULL`);
    expect(rows[0].n).toBe(2);
  });
});

d("payment reconciliation", () => {
  it("caps paid_amount at total and flips status PARTIAL → PAID", async () => {
    const clientId = await makeClient();
    const inv = await pool.query<{ id: string }>(
      `INSERT INTO invoices(client_id,number,status,total) VALUES ($1,'FAC-2026-00001','ISSUED',10000) RETURNING id`,
      [clientId],
    );
    const pay = async (amount: number) => {
      await pool.query(`INSERT INTO payments(invoice_id,client_id,amount) VALUES ($1,$2,$3)`, [inv.rows[0].id, clientId, amount]);
      await pool.query(
        `UPDATE invoices SET paid_amount=least(total,paid_amount+$2),
             status=CASE WHEN paid_amount+$2>=total THEN 'PAID' ELSE 'PARTIAL' END
         WHERE id=$1`,
        [inv.rows[0].id, amount],
      );
    };
    await pay(4000);
    let { rows } = await pool.query(`SELECT paid_amount, status FROM invoices WHERE id=$1`, [inv.rows[0].id]);
    expect(rows[0].status).toBe("PARTIAL");
    await pay(9000); // overpay
    ({ rows } = await pool.query(`SELECT paid_amount, status FROM invoices WHERE id=$1`, [inv.rows[0].id]));
    expect(Number(rows[0].paid_amount)).toBe(10000);
    expect(rows[0].status).toBe("PAID");
  });
});
