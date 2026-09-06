import { NextResponse } from "next/server";

export { text, optionalText, numberValue, dateValue } from "./validate";
export { ApiError, apiFail } from "./errors";
import { ApiError } from "./errors";

/**
 * Standard API envelope.
 *
 *   success →  { "data": <payload> }
 *   failure →  { "error": { "code": "SNAKE_CASE", "message": "..." } }
 *
 * Routes return `ok(payload)` / `fail(code, message, status)`; anything thrown is
 * funnelled through `apiError`. Clients read `body.data` or `body.error.message`.
 */
export function ok<T>(data: T, init?: number | ResponseInit) {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return NextResponse.json({ data }, responseInit);
}

export function fail(code: string, message: string, status = 400, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

const PG_ERROR_MAP: Record<string, { code: string; message: string; status: number }> = {
  "23505": { code: "CONFLICT", message: "Ya existe un registro con ese valor único", status: 409 },
  "23503": { code: "INVALID_REFERENCE", message: "Referencia inválida a otro registro", status: 409 },
  "23514": { code: "VALIDATION", message: "Datos inválidos", status: 400 },
  "22P02": { code: "VALIDATION", message: "Datos inválidos", status: 400 },
};

/**
 * Maps a thrown error to the failure envelope. Known sentinels and Postgres
 * error codes get friendly Spanish messages; anything unrecognised is logged
 * and returned as a generic 500 so internals never leak.
 */
export function apiError(error: unknown) {
  if (error instanceof ApiError) return fail(error.code, error.message, error.status);

  // ZodError (from a bare `schema.parse()`) — surface the first field + message.
  const z = error as { name?: string; issues?: Array<{ path: (string | number)[]; message: string }> };
  if (z?.name === "ZodError" && Array.isArray(z.issues)) {
    const first = z.issues[0];
    const path = first?.path.join(".");
    return fail("VALIDATION", path ? `${path}: ${first.message}` : first?.message || "Datos inválidos", 400);
  }

  const e = error as { status?: number; message?: string; code?: string };
  if (e?.message === "UNAUTHENTICATED") return fail("UNAUTHENTICATED", "No autenticado", 401);
  if (e?.message === "FORBIDDEN") return fail("FORBIDDEN", "Sin permisos", 403);

  const pg = e?.code ? PG_ERROR_MAP[e.code] : undefined;
  if (pg) return fail(pg.code, pg.message, pg.status);

  const status = typeof e?.status === "number" ? e.status : 500;
  if (status >= 500) {
    console.error("[api] unhandled error", error);
    return fail("INTERNAL", "Error interno", status);
  }
  return fail("BAD_REQUEST", e?.message || "Solicitud inválida", status);
}
