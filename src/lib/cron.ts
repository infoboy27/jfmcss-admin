import { ApiError } from "./errors";

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
