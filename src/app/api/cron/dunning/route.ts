import { apiError, ok } from "@/lib/http";
import { assertCronAuth } from "@/lib/cron";
import { runDunning } from "@/lib/dunning";

export const dynamic = "force-dynamic";

/**
 * Runs the automated collections cadence. Also invoked by `/api/cron/daily`, so
 * scheduling this separately is optional — do it if you want reminders to go out
 * at a specific hour. Idempotent.
 */
export async function POST(request: Request) {
  try {
    assertCronAuth(request);
    return ok(await runDunning());
  } catch (e) {
    return apiError(e);
  }
}
