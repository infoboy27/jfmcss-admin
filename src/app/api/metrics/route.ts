import { renderMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * Prometheus scrape target. Guarded by a bearer token when `METRICS_TOKEN` is
 * set (fail closed if it isn't — metrics carry aggregate business figures).
 * Prometheus config: `authorization: { type: Bearer, credentials: <token> }`.
 */
export async function GET(request: Request) {
  const token = process.env.METRICS_TOKEN;
  if (!token) return new Response("metrics disabled: set METRICS_TOKEN\n", { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${token}`) {
    return new Response("unauthorized\n", { status: 401 });
  }
  const body = await renderMetrics();
  return new Response(body, {
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" },
  });
}
