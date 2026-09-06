import { apiError, ok } from "@/lib/http";
import { assertCronAuth, runCronJob } from "@/lib/cron";
import { deliverPendingNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Drains the notification outbox. Schedule this every 1–2 minutes:
 *
 *   * /1 * * * *  curl -fsS -X POST https://control.jfmcss.com/api/cron/notifications \
 *                   -H "Authorization: Bearer $CRON_SECRET"
 *
 * Safe to run concurrently (rows are locked with FOR UPDATE SKIP LOCKED).
 */
export async function POST(request: Request) {
  try {
    assertCronAuth(request);
    const batch = Number(process.env.NOTIFICATION_BATCH || 50);
    return ok(await runCronJob("notifications", () => deliverPendingNotifications(batch)));
  } catch (e) {
    return apiError(e);
  }
}
