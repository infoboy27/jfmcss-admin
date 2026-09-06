import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

const store: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.9.9.9" }),
  cookies: async () => ({
    get: (k: string) => (store[k] ? { value: store[k] } : undefined),
    set: (k: string, v: string) => {
      store[k] = v;
    },
    delete: (k: string) => {
      delete store[k];
    },
  }),
}));

import { hasDb, pool, migrate, reset } from "./setup";
import { hashPassword } from "../../src/lib/auth";
import { generateSecret, totp } from "../../src/lib/totp";
import { POST as login } from "../../src/app/api/auth/login/route";

const d = hasDb ? describe : describe.skip;

beforeAll(() => {
  if (hasDb) migrate();
});
beforeEach(async () => {
  if (hasDb) {
    await reset();
    for (const k of Object.keys(store)) delete store[k];
  }
});
afterAll(async () => {
  if (hasDb) await pool.end();
});

const post = (body: unknown) =>
  login(new Request("http://x/api/auth/login", { method: "POST", body: JSON.stringify(body) }));

d("login + MFA", () => {
  it("logs in without MFA, and demands a code once MFA is enabled", async () => {
    const secret = generateSecret();
    await pool.query(
      `INSERT INTO users(email,name,role,password_hash,active) VALUES ('u@test.local','U','ADMIN',$1,true)`,
      [hashPassword("correcthorse1")],
    );

    // no MFA yet → straight in
    const r1 = await post({ email: "u@test.local", password: "correcthorse1" });
    expect(r1.status).toBe(200);
    expect((await r1.json()).data.user.email).toBe("u@test.local");

    // enable MFA directly
    await pool.query(`UPDATE users SET mfa_enabled=true, mfa_secret=$1 WHERE email='u@test.local'`, [secret]);

    // password alone → mfaRequired, no session
    const r2 = await post({ email: "u@test.local", password: "correcthorse1" });
    const b2 = await r2.json();
    expect(r2.status).toBe(200);
    expect(b2.data).toEqual({ mfaRequired: true });

    // wrong code → 401
    const r3 = await post({ email: "u@test.local", password: "correcthorse1", code: "000000" });
    expect(r3.status).toBe(401);

    // right code → in
    const r4 = await post({ email: "u@test.local", password: "correcthorse1", code: totp(secret) });
    expect(r4.status).toBe(200);
    expect((await r4.json()).data.user.email).toBe("u@test.local");

    // a bad password never reaches the code step
    const r5 = await post({ email: "u@test.local", password: "wrong", code: totp(secret) });
    expect(r5.status).toBe(401);
  });

  it("accepts a one-time backup code and burns it", async () => {
    const secret = generateSecret();
    // "aaaaa-bbbbb" → sha256 of "aaaaabbbbb"
    const { createHash } = await import("node:crypto");
    const h = createHash("sha256").update("aaaaabbbbb").digest("hex");
    await pool.query(
      `INSERT INTO users(email,name,role,password_hash,active,mfa_enabled,mfa_secret,mfa_backup_codes)
       VALUES ('b@test.local','B','ADMIN',$1,true,true,$2,$3)`,
      [hashPassword("correcthorse1"), secret, [h]],
    );

    const ok = await post({ email: "b@test.local", password: "correcthorse1", code: "aaaaa-bbbbb" });
    expect(ok.status).toBe(200);
    // burned — second use fails
    const again = await post({ email: "b@test.local", password: "correcthorse1", code: "aaaaa-bbbbb" });
    expect(again.status).toBe(401);
    const { rows } = await pool.query(`SELECT mfa_backup_codes FROM users WHERE email='b@test.local'`);
    expect(rows[0].mfa_backup_codes).toEqual([]);
  });
});
