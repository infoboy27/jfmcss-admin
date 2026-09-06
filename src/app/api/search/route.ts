import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, ok } from "@/lib/http";
import { isClient } from "@/lib/scope";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Hit = { type: string; id: string; title: string; subtitle: string; module: string };

/**
 * Global search across the whole relationship graph. Client users are silently
 * fenced to their own `client_id`. Case-insensitive substring match, capped.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const q = (new URL(request.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return ok({ query: q, results: [] });

    const like = `%${q}%`;
    const cid = isClient(user) ? user.clientId : null;
    const scoped = (col: string) => (cid ? `AND ${col} = $2` : "");
    const params: any[] = cid ? [like, cid] : [like];

    const [clients, contacts, projects, invoices, tickets, proposals, assets] = await Promise.all([
      cid
        ? Promise.resolve({ rows: [] })
        : query<any>(
            `SELECT id, name, coalesce(tax_id, email, code, '') sub FROM clients
              WHERE name ILIKE $1 OR tax_id ILIKE $1 OR email ILIKE $1 OR code ILIKE $1
              ORDER BY name LIMIT 6`,
            [like],
          ),
      query<any>(
        `SELECT ct.id, ct.name, c.name client_name FROM client_contacts ct JOIN clients c ON c.id=ct.client_id
          WHERE (ct.name ILIKE $1 OR ct.email ILIKE $1) ${scoped("ct.client_id")}
          ORDER BY ct.name LIMIT 5`,
        params,
      ),
      query<any>(
        `SELECT p.id, p.name, p.code, c.name client_name FROM projects p JOIN clients c ON c.id=p.client_id
          WHERE (p.name ILIKE $1 OR p.code ILIKE $1) ${scoped("p.client_id")}
          ORDER BY p.updated_at DESC LIMIT 6`,
        params,
      ),
      query<any>(
        `SELECT i.id, i.number, i.ncf, i.total, c.name client_name, i.document_kind FROM invoices i JOIN clients c ON c.id=i.client_id
          WHERE (i.number ILIKE $1 OR i.ncf ILIKE $1) ${scoped("i.client_id")}
          ORDER BY i.created_at DESC LIMIT 6`,
        params,
      ),
      query<any>(
        `SELECT t.id, t.number, t.subject, c.name client_name FROM tickets t JOIN clients c ON c.id=t.client_id
          WHERE (t.number ILIKE $1 OR t.subject ILIKE $1) ${scoped("t.client_id")}
          ORDER BY t.created_at DESC LIMIT 6`,
        params,
      ),
      query<any>(
        `SELECT p.id, p.number, p.title, p.status, c.name client_name FROM proposals p JOIN clients c ON c.id=p.client_id
          WHERE (p.number ILIKE $1 OR p.title ILIKE $1) ${scoped("p.client_id")}
          ORDER BY p.created_at DESC LIMIT 5`,
        params,
      ),
      query<any>(
        `SELECT a.id, a.name, a.type, c.name client_name FROM assets a JOIN clients c ON c.id=a.client_id
          WHERE (a.name ILIKE $1 OR a.provider ILIKE $1 OR a.external_id ILIKE $1) ${scoped("a.client_id")}
          ORDER BY a.name LIMIT 5`,
        params,
      ),
    ]);

    const results: Hit[] = [
      ...clients.rows.map((r: any) => ({ type: "Cliente", id: r.id, title: r.name, subtitle: r.sub, module: "clients" })),
      ...contacts.rows.map((r: any) => ({ type: "Contacto", id: r.id, title: r.name, subtitle: r.client_name, module: "clients" })),
      ...projects.rows.map((r: any) => ({ type: "Proyecto", id: r.id, title: r.name, subtitle: `${r.code} · ${r.client_name}`, module: "projects" })),
      ...invoices.rows.map((r: any) => ({
        type: r.document_kind === "CREDIT_NOTE" ? "Nota de crédito" : "Factura",
        id: r.id,
        title: r.number,
        subtitle: `${r.client_name} · ${r.ncf || "borrador"}`,
        module: "billing",
      })),
      ...tickets.rows.map((r: any) => ({ type: "Ticket", id: r.id, title: `${r.number} · ${r.subject}`, subtitle: r.client_name, module: "support" })),
      ...proposals.rows.map((r: any) => ({ type: "Propuesta", id: r.id, title: `${r.number} · ${r.title}`, subtitle: `${r.client_name} · ${r.status}`, module: "proposals" })),
      ...assets.rows.map((r: any) => ({ type: "Activo", id: r.id, title: r.name, subtitle: `${r.type} · ${r.client_name}`, module: "assets" })),
    ];
    return ok({ query: q, results });
  } catch (e) {
    return apiError(e);
  }
}
