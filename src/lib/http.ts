import { NextResponse } from "next/server";

export { text, optionalText, numberValue, dateValue } from "./validate";

/**
 * Maps thrown errors to a JSON response. Known sentinels (`UNAUTHENTICATED`,
 * `FORBIDDEN`) and Postgres error codes are translated to friendly Spanish
 * messages; anything else is logged and returned as a generic 500 so internal
 * details never leak to the client.
 */
export function apiError(error: unknown) {
  const e = error as { status?: number; message?: string; code?: string };
  if (e?.message === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (e?.message === "FORBIDDEN") return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  if (e?.code === "23505") return NextResponse.json({ error: "Ya existe un registro con ese valor único" }, { status: 409 });
  if (e?.code === "23503") return NextResponse.json({ error: "Referencia inválida a otro registro" }, { status: 409 });
  if (e?.code === "23514" || e?.code === "22P02") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const status = typeof e?.status === "number" ? e.status : 500;
  if (status >= 500) {
    console.error("[api] unhandled error", error);
    return NextResponse.json({ error: "Error interno" }, { status });
  }
  return NextResponse.json({ error: e?.message || "Solicitud inválida" }, { status });
}
