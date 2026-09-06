import type { PoolClient } from "pg";

export async function allocateFiscalNumber(client: PoolClient, documentType: string) {
  const { rows } = await client.query<{ id: string; prefix: string; next_number: string; max_number: string | null; expires_at: string | null }>(
    `SELECT id,prefix,next_number::text,max_number::text,expires_at::text
       FROM fiscal_sequences WHERE document_type=$1 AND enabled=true FOR UPDATE`, [documentType]
  );
  const seq = rows[0];
  if (!seq) throw Object.assign(new Error(`Secuencia fiscal ${documentType} no configurada`), { status: 422 });
  const next = Number(seq.next_number);
  if (seq.max_number && next > Number(seq.max_number)) throw Object.assign(new Error("Secuencia fiscal agotada"), { status: 422 });
  if (seq.expires_at && new Date(seq.expires_at) < new Date()) throw Object.assign(new Error("Secuencia fiscal vencida"), { status: 422 });
  await client.query(`UPDATE fiscal_sequences SET next_number=next_number+1,updated_at=now() WHERE id=$1`, [seq.id]);
  return `${seq.prefix}${String(next).padStart(seq.prefix.startsWith("E") ? 10 : 8, "0")}`;
}

export async function submitEcf(invoice: Record<string, unknown>) {
  if (process.env.ECF_ENABLED !== "true") return { status: "PENDING_CONFIGURATION" as const, trackId: null };
  const url = process.env.ECF_PROVIDER_URL;
  const token = process.env.ECF_PROVIDER_TOKEN;
  if (!url || !token) throw new Error("ECF habilitado pero el proveedor no está configurado");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ issuerRnc: process.env.ECF_RNC, invoice }),
    signal: AbortSignal.timeout(Number(process.env.ECF_TIMEOUT_MS || 15_000)),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Proveedor e-CF rechazó la solicitud (${response.status})`);
  return { status: "SUBMITTED" as const, trackId: String(data.trackId || data.id || "") || null };
}
