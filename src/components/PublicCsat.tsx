"use client";
import { useEffect, useState } from "react";

type Row = Record<string, any>;

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `HTTP ${r.status}`);
  return d?.data ?? d;
}

const FACES = [
  { n: 1, emoji: "😞", label: "Muy mala" },
  { n: 2, emoji: "😕", label: "Mala" },
  { n: 3, emoji: "😐", label: "Regular" },
  { n: 4, emoji: "🙂", label: "Buena" },
  { n: 5, emoji: "😀", label: "Excelente" },
];

export default function PublicCsat({ token }: { token: string }) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api(`/api/public/csat/${token}`)
      .then((d) => {
        setData(d);
        if (d.submitted) setDone(true);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function submit() {
    if (!score) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/public/csat/${token}`, { method: "POST", body: JSON.stringify({ score, comment }) });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shell = (inner: React.ReactNode) => (
    <div className="pp-shell">
      <div className="pp-card">
        <div className="pp-head">
          <div className="pp-brand">
            <div className="pp-logo">J</div>
            <div>
              <b>JFMCSS</b>
              <span>SOPORTE</span>
            </div>
          </div>
          {data?.number && (
            <div className="pp-num">
              <span>TICKET</span>
              <b>{data.number}</b>
            </div>
          )}
        </div>
        {inner}
      </div>
    </div>
  );

  if (error && !data) return shell(<div className="pp-msg">{error}</div>);
  if (!data) return shell(<div className="pp-msg">Cargando…</div>);

  if (done)
    return shell(
      <div className="csat-thanks">
        <div className="csat-thanks-face">{FACES.find((f) => f.n === (score || data.score))?.emoji ?? "🙏"}</div>
        <h1>¡Gracias por tu respuesta!</h1>
        <p className="pp-meta">Tu opinión nos ayuda a mejorar la atención de JFMCSS.</p>
      </div>,
    );

  return shell(
    <>
      <h1>¿Cómo estuvo la atención?</h1>
      <p className="pp-meta">
        Caso <strong>{data.number}</strong> — {data.subject}
      </p>
      <div className="csat-faces">
        {FACES.map((f) => (
          <button
            key={f.n}
            type="button"
            className={score === f.n ? "on" : ""}
            onClick={() => setScore(f.n)}
            aria-label={f.label}
          >
            <span>{f.emoji}</span>
            <em>{f.label}</em>
          </button>
        ))}
      </div>
      <textarea
        className="csat-comment"
        placeholder="¿Algo que quieras contarnos? (opcional)"
        value={comment}
        maxLength={2000}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <div className="csat-error">{error}</div>}
      <button className="csat-submit" disabled={!score || busy} onClick={submit}>
        {busy ? "Enviando…" : "Enviar"}
      </button>
    </>,
  );
}
