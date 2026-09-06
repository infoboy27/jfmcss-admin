import { requireUser } from "@/lib/auth";
import { apiError, ok } from "@/lib/http";
import { buildPulse } from "@/lib/pulse";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await buildPulse(user));
  } catch (e) {
    return apiError(e);
  }
}
