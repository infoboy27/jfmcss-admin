"use client";
import { useEffect, useState } from "react";

type Row = Record<string, any>;
const M = (v: any, c = "RD$") => `${c}${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const D = (v: any) => (v ? new Date(v).toLocaleDateString("es-DO", { day: "2-digit", month: "long", year: "numeric" }) : "—");

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `HTTP ${r.status}`);
  return d?.data ?? d;
}

export default function PublicProposal({ token }: { token: string }) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<"ACCEPTED" | "REJECTED" | null>(null);

  useEffect(() => {
    api(`/api/public/proposals/${token}`).then(setData).catch((e) => setError(e.message));
  }, [token]);

  async function decide(decision: "ACCEPT" | "REJECT") {
    setBusy(true);
    setError("");
    try {
      const r = await api(`/api/public/proposals/${token}`, { method: "POST", body: JSON.stringify({ decision, note }) });
      setDone(r.status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="pp-shell"><div className="pp-card pp-msg">{error}</div></div>;
  if (!data) return <div className="pp-shell"><div className="pp-card pp-msg">Cargando…</div></div>;

  const status = done ?? data.status;
  const cur = data.currency === "USD" ? "US$" : data.currency === "EUR" ? "€" : "RD$";

  return (
    <div className="pp-shell">
      <div className="pp-card">
        <header className="pp-head">
          <div className="pp-brand"><span className="pp-logo">J</span><div><b>JFMCSS</b><span>SOFTWARE · CLOUD · AUTOMATION</span></div></div>
          <div className="pp-num"><span>PROPUESTA</span><b>{data.number}</b></div>
        </header>

        <h1>{data.title}</h1>
        <p className="pp-meta">Preparada para <b>{data.client}</b>{data.validUntil ? ` · válida hasta ${D(data.validUntil)}` : ""}</p>
        {data.summary && <p className="pp-summary">{data.summary}</p>}

        <table className="pp-table">
          <thead><tr><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Importe</th></tr></thead>
          <tbody>
            {(data.items || []).map((it: Row, i: number) => (
              <tr key={i}>
                <td>{it.description}</td>
                <td>{Number(it.quantity)}</td>
                <td>{M(it.unit_price, cur)}</td>
                <td>{M(it.line_total, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pp-totals">
          <span>Subtotal <b>{M(data.subtotal, cur)}</b></span>
          <span>ITBIS <b>{M(data.tax, cur)}</b></span>
          {data.discount > 0 && <span>Descuento <b>{M(data.discount, cur)}</b></span>}
          <span className="pp-grand">Total <b>{M(data.total, cur)}</b></span>
        </div>

        {(data.paymentTerms || (data.milestones || []).length > 0) && (
          <div className="pp-terms">
            <h3>Forma de pago</h3>
            {data.paymentTerms && <p>{data.paymentTerms}</p>}
            {(data.milestones || []).map((m: Row, i: number) => (
              <div key={i} className="pp-ms"><span>{m.label}{m.percentage != null ? ` (${Number(m.percentage)}%)` : ""}</span><b>{M(m.amount, cur)}</b></div>
            ))}
          </div>
        )}

        {data.terms && <div className="pp-terms"><h3>Términos</h3><p>{data.terms}</p></div>}

        {status === "ACCEPTED" && <div className="pp-result ok">Propuesta aceptada. Gracias — nos pondremos en contacto para dar inicio.</div>}
        {status === "REJECTED" && <div className="pp-result no">Propuesta rechazada. Gracias por tu tiempo.</div>}
        {status === "EXPIRED" && <div className="pp-result no">Esta propuesta ha expirado. Contáctanos para renovarla.</div>}

        {data.decidable && !done && (
          <div className="pp-actions">
            <textarea placeholder="Comentario (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div>
              <button className="pp-btn ghost" disabled={busy} onClick={() => decide("REJECT")}>Rechazar</button>
              <button className="pp-btn primary" disabled={busy} onClick={() => decide("ACCEPT")}>Aceptar propuesta</button>
            </div>
          </div>
        )}

        <footer className="pp-foot">JFMCSS · República Dominicana · jfmcss.com</footer>
      </div>
    </div>
  );
}
