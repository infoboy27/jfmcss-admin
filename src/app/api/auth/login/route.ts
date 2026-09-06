import { bootstrapIfNeeded, createSession, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { headers } from "next/headers";
import { apiError, ok, fail, text } from "@/lib/http";
import { verifyTotp, burnBackupCode } from "@/lib/totp";

const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT || 10);
const WINDOW_SECONDS = Number(process.env.LOGIN_RATE_WINDOW_SECONDS || 300);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = text(body.email, 254).toLowerCase();
    const password = text(body.password, 500);
    if (!email || !password) {
      return fail("VALIDATION", "Correo y contraseña son requeridos", 400);
    }

    // Rate limit per IP and per targeted account to slow credential stuffing /
    // password spraying without locking a victim out globally.
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    for (const key of [`login:ip:${ip}`, `login:acct:${email}`]) {
      const rl = rateLimit(key, MAX_ATTEMPTS, WINDOW_SECONDS);
      if (!rl.ok) {
        return fail("RATE_LIMITED", "Demasiados intentos. Intenta de nuevo más tarde.", 429, {
          "retry-after": String(rl.retryAfterSeconds),
        });
      }
    }

    await bootstrapIfNeeded(email, password);
    const { rows } = await query<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
      role: string;
      active: boolean;
      mfa_enabled: boolean;
      mfa_secret: string | null;
      mfa_backup_codes: string[];
    }>(
      `SELECT id,email,name,password_hash,role,active,mfa_enabled,mfa_secret,mfa_backup_codes
         FROM users WHERE lower(email)=lower($1) LIMIT 1`,
      [email],
    );
    const user = rows[0];
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      await audit(user?.id ?? null, "LOGIN_FAILED", "SESSION", null, { email });
      return fail("UNAUTHENTICATED", "Credenciales inválidas", 401);
    }

    if (user.mfa_enabled && user.mfa_secret) {
      const submitted = text(body.code, 40).replace(/\s/g, "");
      if (!submitted) return ok({ mfaRequired: true });
      const totpOk = verifyTotp(user.mfa_secret, submitted);
      let backupRemaining: string[] | null = null;
      if (!totpOk) backupRemaining = burnBackupCode(submitted, user.mfa_backup_codes ?? []);
      if (!totpOk && !backupRemaining) {
        await audit(user.id, "LOGIN_FAILED", "SESSION", null, { email, reason: "mfa" });
        return fail("MFA_INVALID", "Código de verificación inválido", 401);
      }
      if (backupRemaining) {
        await query(`UPDATE users SET mfa_backup_codes=$2 WHERE id=$1`, [user.id, backupRemaining]);
        await audit(user.id, "MFA_BACKUP_USED", "USER", user.id, { remaining: backupRemaining.length });
      }
    }

    await createSession(user.id);
    await audit(user.id, "LOGIN", "SESSION", null, { email: user.email, mfa: user.mfa_enabled });
    return ok({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    return apiError(error);
  }
}
