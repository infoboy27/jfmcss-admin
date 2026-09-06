import { NextResponse } from "next/server";

export function apiError(error: unknown) {
  const e = error as { status?: number; message?: string; code?: string };
  if (e?.message === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (e?.message === "FORBIDDEN") return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  if (e?.code === "23505") return NextResponse.json({ error: "Ya existe un registro con ese valor único" }, { status: 409 });
  console.error(error);
  return NextResponse.json({ error: e?.message || "Error interno" }, { status: e?.status || 500 });
}

export function text(v: unknown, max = 5000) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
export function optionalText(v: unknown, max = 5000) {
  const s = text(v, max); return s || null;
}
export function numberValue(v: unknown, fallback = 0) {
  const n = Number(v); return Number.isFinite(n) ? n : fallback;
}
export function dateValue(v: unknown) {
  const s = text(v, 20); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
