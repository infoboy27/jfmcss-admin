import { apiError, ok } from "@/lib/http";
import { assertCronAuth } from "@/lib/cron";
import { runRecurringBilling } from "@/lib/recurring";

export const dynamic = "force-dynamic";

/**
 * Generates invoices for every recurring service whose `next_invoice_date` has
 * arrived. Idempotent — safe to run daily (or more often). Schedule:
 *
 *   30 6 * * *  curl -fsS -X POST https://control.jfmcss.com/api/cron/recurring \
 *                 -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: Request) {
  try {
    assertCronAuth(request);
    return ok(await runRecurringBilling());
  } catch (e) {
    return apiError(e);
  }
}
