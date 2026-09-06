import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, ok } from "@/lib/http";
import { readPage, pageMeta } from "@/lib/pagination";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: Request) {
  try {
    await requireUser(["SUPER_ADMIN", "ADMIN"]);
    const u = new URL(request.url);
    const page = readPage(request, { defaultLimit: 50, maxLimit: 200 });

    const where: string[] = [];
    const params: unknown[] = [];
    const eq = (col: string, val: string | null) => {
      if (!val) return;
      params.push(val);
      where.push(`a.${col} = $${params.length}`);
    };
    eq("entity_type", u.searchParams.get("entityType"));
    eq("action", u.searchParams.get("action"));
    eq("actor_id", u.searchParams.get("actorId"));
    const q = (u.searchParams.get("q") || "").trim();
    if (q) {
      params.push(`%${q}%`);
      where.push(`(a.entity_id ILIKE $${params.length} OR a.entity_type ILIKE $${params.length} OR a.action ILIKE $${params.length})`);
    }
    const since = u.searchParams.get("since");
    if (since && /^\d{4}-\d{2}-\d{2}$/.test(since)) {
      params.push(since);
      where.push(`a.created_at >= $${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows, count, facets] = await Promise.all([
      query<any>(
        `SELECT a.id,a.action,a.entity_type,a.entity_id,a.before_data,a.after_data,a.ip,a.created_at,
                u.name actor_name,u.email actor_email
           FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
           ${clause}
          ORDER BY a.created_at DESC
          LIMIT ${page.limit} OFFSET ${page.offset}`,
        params,
      ),
      query<{ n: string }>(`SELECT count(*)::text n FROM audit_log a ${clause}`, params),
      query<any>(
        `SELECT
           (SELECT array_agg(DISTINCT entity_type ORDER BY entity_type) FROM audit_log) entity_types,
           (SELECT array_agg(DISTINCT action ORDER BY action) FROM audit_log) actions`,
      ),
    ]);

    return ok({
      audit: rows.rows,
      ...pageMeta(rows.rows.length, Number(count.rows[0].n), page),
      facets: {
        entityTypes: facets.rows[0]?.entity_types ?? [],
        actions: facets.rows[0]?.actions ?? [],
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
