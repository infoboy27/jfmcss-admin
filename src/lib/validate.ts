/**
 * Pure request-value coercion helpers. No framework imports so this module is
 * safe to unit-test and to import from anywhere (including edge/runtime-agnostic
 * code).
 *
 * These are NOT a schema validator — they clamp and normalize. Routes still
 * enforce required fields and domain rules explicitly.
 */
export function text(v: unknown, max = 5000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function optionalText(v: unknown, max = 5000): string | null {
  const s = text(v, max);
  return s || null;
}

export function numberValue(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function dateValue(v: unknown): string | null {
  const s = text(v, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
