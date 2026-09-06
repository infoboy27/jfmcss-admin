import type { SessionUser } from "./auth";
import { ApiError } from "./http";

/**
 * Client-portal data isolation.
 *
 * A `CLIENT` user may only ever see/act on rows belonging to their own
 * `clientId`. These helpers centralise that rule so it can't be forgotten in
 * one of the ~dozen routes that need it — and so it's covered by a single test
 * suite rather than per route.
 *
 * Staff roles (`SUPER_ADMIN`, `ADMIN`, `FINANCE`, `PM`, `SUPPORT`) are
 * unrestricted here; their access is gated by `requireUser([roles])` instead.
 */

export function isClient(user: SessionUser): boolean {
  return user.role === "CLIENT";
}

/** Throw FORBIDDEN unless `user` is staff or the row belongs to their client. */
export function assertClientAccess(user: SessionUser, resourceClientId: string | null | undefined): void {
  if (!isClient(user)) return;
  if (!user.clientId || !resourceClientId || user.clientId !== resourceClientId) {
    throw new ApiError("FORBIDDEN", "Sin permisos", 403);
  }
}

/**
 * SQL fragment + params for scoping a list query to a CLIENT user.
 *
 *   const scope = clientScope(user, "i.client_id");
 *   query(`SELECT ... FROM invoices i ${scope.where} ...`, [...scope.params, ...more]);
 *
 * `nextParam` is the 1-based index the caller's own params should start at.
 */
export function clientScope(user: SessionUser, column: string, nextParam = 1): {
  where: string;
  params: unknown[];
  nextParam: number;
} {
  if (!isClient(user)) return { where: "", params: [], nextParam };
  return { where: `WHERE ${column} = $${nextParam}`, params: [user.clientId], nextParam: nextParam + 1 };
}

/** The clientId a CLIENT is forced to; the requested one for staff. */
export function resolveClientId(user: SessionUser, requested: string | null | undefined): string | null {
  return isClient(user) ? user.clientId : (requested ?? null);
}
