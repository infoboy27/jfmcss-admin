import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Liveness probe — intentionally NOT wrapped in the API envelope so external
// monitors and the container HEALTHCHECK can read a stable top-level shape.
export async function GET() {
  try {
    await query("SELECT 1");
    return NextResponse.json({ ok: true, service: "jfmcss-control", database: "ok", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, database: "error" }, { status: 503 });
  }
}
