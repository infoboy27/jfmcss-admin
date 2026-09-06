import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiError, ok, fail, text } from "@/lib/http";
import { generateSecret, verifyTotp, otpauthUri, makeBackupCodes } from "@/lib/totp";

/**
 * Manage the caller's own TOTP two-factor auth.
 *   { action: "enroll" }            → new pending secret + otpauth URI
 *   { action: "activate", code }    → verify code, enable, return backup codes
 *   { action: "disable",  code }    → verify code, wipe MFA
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const action = text(body.action, 20);
    const code = text(body.code, 40);

    const cur = (
      await query<{ mfa_secret: string | null; mfa_enabled: boolean }>(
        `SELECT mfa_secret, mfa_enabled FROM users WHERE id=$1`,
        [user.id],
      )
    ).rows[0];

    if (action === "enroll") {
      if (cur.mfa_enabled) return fail("ALREADY_ENABLED", "El 2FA ya está activo. Desactívalo primero.", 409);
      const secret = generateSecret();
      await query(`UPDATE users SET mfa_secret=$2 WHERE id=$1`, [user.id, secret]);
      return ok({ secret, otpauthUri: otpauthUri(secret, user.email) });
    }

    if (action === "activate") {
      if (cur.mfa_enabled) return fail("ALREADY_ENABLED", "El 2FA ya está activo.", 409);
      if (!cur.mfa_secret) return fail("NO_SECRET", "Primero genera un secreto (enroll).", 409);
      if (!verifyTotp(cur.mfa_secret, code)) return fail("MFA_INVALID", "Código inválido. Revisa la hora de tu dispositivo.", 400);
      const { plain, hashed } = makeBackupCodes();
      await query(`UPDATE users SET mfa_enabled=true, mfa_backup_codes=$2, mfa_enrolled_at=now() WHERE id=$1`, [user.id, hashed]);
      await audit(user.id, "MFA_ENABLED", "USER", user.id);
      return ok({ enabled: true, backupCodes: plain });
    }

    if (action === "disable") {
      if (!cur.mfa_enabled) return ok({ enabled: false });
      if (!cur.mfa_secret || !verifyTotp(cur.mfa_secret, code)) {
        return fail("MFA_INVALID", "Código inválido; el 2FA sigue activo.", 400);
      }
      await query(
        `UPDATE users SET mfa_enabled=false, mfa_secret=NULL, mfa_backup_codes='{}', mfa_enrolled_at=NULL WHERE id=$1`,
        [user.id],
      );
      await audit(user.id, "MFA_DISABLED", "USER", user.id);
      return ok({ enabled: false });
    }

    return fail("VALIDATION", "Acción no soportada", 400);
  } catch (e) {
    return apiError(e);
  }
}
