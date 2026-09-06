import crypto from "node:crypto";

/**
 * RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) and RFC 4648 base32 — no
 * external dependency. Used for optional per-user two-factor auth.
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("secreto base32 inválido");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

export function totp(secretB32: string, atMs = Date.now()): string {
  return hotp(base32Decode(secretB32), Math.floor(atMs / 30_000));
}

/** Constant-time check across ±`window` steps to tolerate clock drift. */
export function verifyTotp(secretB32: string, token: string, window = 1): boolean {
  const t = (token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  const secret = base32Decode(secretB32);
  const step = Math.floor(Date.now() / 30_000);
  for (let w = -window; w <= window; w++) {
    const candidate = hotp(secret, step + w);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(t))) return true;
  }
  return false;
}

export function otpauthUri(secretB32: string, account: string, issuer = "JFMCSS Control"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ─── one-time backup codes ────────────────────────────────────────────────

const hashCode = (code: string) => crypto.createHash("sha256").update(code.replace(/\W/g, "").toLowerCase()).digest("hex");

export function makeBackupCodes(n = 10): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  for (let i = 0; i < n; i++) {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { plain, hashed: plain.map(hashCode) };
}

/** Returns the remaining hashes if `code` matched one (so the caller can persist the burn), else null. */
export function burnBackupCode(code: string, hashed: string[]): string[] | null {
  const h = hashCode(code);
  const idx = hashed.indexOf(h);
  if (idx < 0) return null;
  return hashed.filter((_, i) => i !== idx);
}
