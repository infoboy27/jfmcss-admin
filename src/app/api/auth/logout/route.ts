import { destroySession, getSessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok } from "@/lib/http";

export async function POST() {
  const user = await getSessionUser();
  if (user) await audit(user.id, "LOGOUT", "SESSION", null);
  await destroySession();
  return ok({ ok: true });
}
