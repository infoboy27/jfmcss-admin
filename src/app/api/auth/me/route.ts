import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ok, fail } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail("UNAUTHENTICATED", "No autenticado", 401);
  const { rows } = await query<{ mfa_enabled: boolean }>(`SELECT mfa_enabled FROM users WHERE id=$1`, [user.id]);
  return ok({ user: { ...user, mfaEnabled: rows[0]?.mfa_enabled ?? false } });
}
