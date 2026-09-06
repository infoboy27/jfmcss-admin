import { describe, it, expect } from "vitest";
import { generateSecret, totp, verifyTotp, otpauthUri, makeBackupCodes, burnBackupCode } from "../src/lib/totp";

describe("totp", () => {
  it("generates a valid base32 secret and round-trips a code", () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(32);
    const code = totp(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, code, 0)).toBe(true);
  });

  it("rejects the wrong code, garbage, and codes from another secret", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(verifyTotp(a, "000000")).toBe(false);
    expect(verifyTotp(a, "abc")).toBe(false);
    expect(verifyTotp(a, totp(b))).toBe(false);
  });

  it("accepts the previous 30s window (clock drift)", () => {
    const secret = generateSecret();
    const prev = totp(secret, Date.now() - 30_000);
    expect(verifyTotp(secret, prev, 1)).toBe(true);
  });

  it("matches a known RFC-6238-style vector", () => {
    // ASCII "12345678901234567890" → base32
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    // T = 59s → counter 1 → RFC 6238 SHA1 test value 94287082
    expect(totp(secret, 59_000)).toBe("287082");
  });

  it("builds an otpauth URI with issuer + secret", () => {
    const uri = otpauthUri("ABC234", "user@x.com");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=ABC234");
    expect(uri).toContain("issuer=JFMCSS+Control");
  });

  it("backup codes burn once", () => {
    const { plain, hashed } = makeBackupCodes(5);
    expect(plain).toHaveLength(5);
    expect(hashed).toHaveLength(5);
    const remaining = burnBackupCode(plain[2], hashed);
    expect(remaining).toHaveLength(4);
    expect(burnBackupCode(plain[2], remaining!)).toBeNull(); // already gone
    expect(burnBackupCode("nope-nope", hashed)).toBeNull();
  });
});
