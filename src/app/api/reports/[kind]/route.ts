import { requireUser } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/http";
import { arAging, revenueReport, renewalWatch, toCsv } from "@/lib/reports";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reporting endpoint. `GET /api/reports/ar` · `GET /api/reports/revenue?from=&to=`.
 * `?format=csv` streams a spreadsheet-friendly flat file where it makes sense.
 */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const user = await requireUser();
    const { kind } = await params;
    const url = new URL(request.url);
    const csv = url.searchParams.get("format") === "csv";

    if (kind === "ar") {
      const data = await arAging(user);
      if (csv) {
        return new Response(toCsv(data.byClient), {
          headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ar-aging.csv"` },
        });
      }
      return ok(data);
    }

    if (kind === "revenue") {
      const today = new Date();
      const defFrom = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().slice(0, 10);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const f = from && ISO.test(from) ? from : defFrom;
      const t = to && ISO.test(to) ? to : today.toISOString().slice(0, 10);
      const data = await revenueReport(user, f, t);
      if (csv) {
        return new Response(toCsv(data.monthly), {
          headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="revenue.csv"` },
        });
      }
      return ok(data);
    }

    if (kind === "renewals") {
      const data = await renewalWatch(user);
      if (csv) {
        return new Response(toCsv(data.items), {
          headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="renewals.csv"` },
        });
      }
      return ok(data);
    }

    return fail("NOT_FOUND", "Reporte no encontrado", 404);
  } catch (e) {
    return apiError(e);
  }
}
