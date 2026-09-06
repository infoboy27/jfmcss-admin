import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Readiness probe: verifies the process can actually serve traffic (DB reachable
 * and the core schema migrated). Use this for orchestrator readiness gates and
 * load-balancer health checks; use `/api/health` for a cheap liveness ping.
 */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};
  try {
    await query("SELECT 1");
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }
  try {
    await query("SELECT 1 FROM users LIMIT 1");
    checks.schema = "ok";
  } catch {
    checks.schema = "error";
  }
  const ready = Object.values(checks).every((v) => v === "ok");
  // Not enveloped — this is an infrastructure probe, not an API resource.
  return NextResponse.json({ ready, checks, time: new Date().toISOString() }, { status: ready ? 200 : 503 });
}
