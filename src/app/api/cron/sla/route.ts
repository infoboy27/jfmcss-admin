import { apiError, ok } from "@/lib/http";
import { assertCronAuth } from "@/lib/cron";
import { runSlaChecks } from "@/lib/sla";

export const dynamic = "force-dynamic";

/**
 * Fires SLA threshold alerts (50/75/90/100 %), escalates at ≥90 % and flags
 * breaches. Schedule every 5–15 minutes:
 *
 *   *\/10 * * * *  curl -fsS -X POST https://control.jfmcss.com/api/cron/sla \
 *                    -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: Request) {
  try {
    assertCronAuth(request);
    return ok(await runSlaChecks());
  } catch (e) {
    return apiError(e);
  }
}
