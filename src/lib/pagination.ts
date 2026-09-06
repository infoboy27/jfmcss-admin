/**
 * Offset pagination for the list endpoints. Kept deliberately simple: the UI
 * passes `?limit=&offset=`, the response carries `{ items, total, limit, offset,
 * hasMore }`. A caller that ignores the params still gets the first page.
 */
export type Page = { limit: number; offset: number };

export function readPage(request: Request, opts: { defaultLimit?: number; maxLimit?: number } = {}): Page {
  const def = opts.defaultLimit ?? 50;
  const max = opts.maxLimit ?? 200;
  const p = new URL(request.url).searchParams;
  const limit = Math.min(max, Math.max(1, Number(p.get("limit")) || def));
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  return { limit, offset };
}

/** Envelope metadata to spread alongside the (unchanged) list key. */
export function pageMeta(returned: number, total: number, page: Page) {
  return {
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: page.offset + returned < total,
  };
}
