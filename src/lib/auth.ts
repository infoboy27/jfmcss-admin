import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { query } from "./db";

export type Role = "SUPER_ADMIN" | "ADMIN" | "FINANCE" | "PM" | "SUPPORT" | "CLIENT";
export type SessionUser = { id: string; email: string; name: string; role: Role; clientId: string | null };
export const SESSION_COOKIE = "jfmcss_session";

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [kind, n, r, p, salt, expectedHex] = stored.split("$");
  if (kind !== "scrypt" || !salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const days = Math.max(1, Number(process.env.SESSION_DAYS || 7));
  const expiresAt = new Date(Date.now() + days * 86400000);
  const h = await headers();
  await query(
    `INSERT INTO sessions(user_id,token_hash,expires_at,user_agent,ip) VALUES($1,$2,$3,$4,$5)`,
    [userId, tokenHash(token), expiresAt, h.get("user-agent"), h.get("x-forwarded-for")?.split(",")[0]?.trim() || null],
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return expiresAt;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await query(`DELETE FROM sessions WHERE token_hash=$1`, [tokenHash(token)]);
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await query<{
    id: string; email: string; name: string; role: Role; client_id: string | null;
  }>(
    `SELECT u.id,u.email,u.name,u.role,u.client_id
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,
    [tokenHash(token)],
  );
  const u = rows[0];
  return u ? { id: u.id, email: u.email, name: u.name, role: u.role, clientId: u.client_id } : null;
}

export async function requireUser(roles?: Role[]) {
  const user = await getSessionUser();
  if (!user) throw Object.assign(new Error("UNAUTHENTICATED"), { status: 401 });
  if (roles && !roles.includes(user.role)) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
  return user;
}

export async function bootstrapIfNeeded(email: string, password: string) {
  const count = await query<{ count: string }>(`SELECT count(*)::text count FROM users`);
  if (Number(count.rows[0]?.count || 0) !== 0) return null;
  const configuredEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const configuredPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  if (!configuredEmail || !configuredPassword || email.toLowerCase() !== configuredEmail || password !== configuredPassword) return null;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,'SUPER_ADMIN') RETURNING id`,
    [configuredEmail, process.env.BOOTSTRAP_ADMIN_NAME || "JFMCSS Admin", hashPassword(password)],
  );
  return rows[0]?.id || null;
}
