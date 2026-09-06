"use client";
import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, code: step === "mfa" ? code : undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message || d?.error || "No se pudo iniciar sesión");
      if (d?.data?.mfaRequired) {
        setStep("mfa");
        setBusy(false);
        return;
      }
      location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="live-brand">
          <div className="live-logo">J</div>
          <div>
            <strong>JFMCSS</strong>
            <span>CONTROL</span>
          </div>
        </div>
        <div className="eyebrow">OPERATIONS OS</div>
        <h1>{step === "mfa" ? "Verificación en dos pasos" : "Acceso seguro"}</h1>
        <p>
          {step === "mfa"
            ? "Introduce el código de 6 dígitos de tu app de autenticación (o un código de respaldo)."
            : "CRM, proyectos, facturación, cobros, soporte y operaciones en un solo lugar."}
        </p>
        <form onSubmit={submit}>
          {step === "credentials" ? (
            <>
              <label>
                Correo
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            </>
          ) : (
            <label>
              Código
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                autoFocus
                required
              />
            </label>
          )}
          {error && <div className="form-error">{error}</div>}
          <button className="primary-btn login-submit" disabled={busy}>
            {busy ? "Validando…" : step === "mfa" ? "Verificar" : "Entrar a JFMCSS Control"}
          </button>
        </form>
        {step === "credentials" ? (
          <small>El primer acceso puede crear el Super Admin usando BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD.</small>
        ) : (
          <small>
            <button type="button" className="link-btn" onClick={() => { setStep("credentials"); setCode(""); setError(""); }}>
              ← Volver
            </button>
          </small>
        )}
      </section>
    </main>
  );
}
