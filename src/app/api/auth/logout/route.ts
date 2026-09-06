import { NextResponse } from "next/server";
import { destroySession, getSessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST() {
  const user = await getSessionUser();
  if (user) await audit(user.id, "LOGOUT", "SESSION", null);
  await destroySession();
  return NextResponse.json({ ok: true });
}
