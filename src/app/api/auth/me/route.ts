import { getSessionUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  return user ? ok({ user }) : fail("UNAUTHENTICATED", "No autenticado", 401);
}
