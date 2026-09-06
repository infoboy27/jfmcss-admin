import { requireUser } from "@/lib/auth";
import { apiError, ok } from "@/lib/http";
import { assertClientAccess } from "@/lib/scope";
import { computeHealth } from "@/lib/health";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    assertClientAccess(user, id);
    const exists = (await query(`SELECT 1 FROM clients WHERE id=$1`, [id])).rows[0];
    if (!exists) return ok({ score: null, band: null, factors: [] });
    const health = await computeHealth(id);
    // Keep the cached column fresh while we're here.
    await query(`UPDATE clients SET health_score=$2 WHERE id=$1`, [id, health.score]);
    return ok(health);
  } catch (e) {
    return apiError(e);
  }
}
