import { ApiError } from "./errors";
import { log } from "./log";
import { inc } from "./metrics";

/**
 * Guards a cron endpoint with the shared bearer secret. Throws 401 on mismatch;
 * throws 500 if `CRON_SECRET` isn't set (fail closed rather than open).
 */
export function assertCronAuth(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError("MISCONFIGURED", "CRON_SECRET no está configurado", 500);
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new ApiError("UNAUTHENTICATED", "Unauthorized", 401);
  }
}

/**
 * Runs a cron job body with structured start/finish logging, a duration, and
 * `jfmcss_cron_runs_total{job,outcome}` / `jfmcss_cron_duration_seconds` metrics.
 */
export async function runCronJob<T>(job: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    inc("jfmcss_cron_runs_total", { job, outcome: "ok" });
    inc("jfmcss_cron_duration_seconds_sum", { job }, ms / 1000);
    inc("jfmcss_cron_duration_seconds_count", { job });
    log.info("cron job finished", { job, ms, ...(result && typeof result === "object" ? result : {}) });
    return result;
  } catch (err) {
    inc("jfmcss_cron_runs_total", { job, outcome: "error" });
    log.error("cron job failed", err, { job, ms: Date.now() - start });
    throw err;
  }
}
