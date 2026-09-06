import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy with a fresh nonce.
 *
 * Next.js injects its bootstrap/hydration <script> tags inline, so a static
 * `script-src 'self'` breaks hydration. Generating a nonce here and echoing it
 * in both the CSP and the `x-nonce` request header lets Next tag its own inline
 * scripts with it; `strict-dynamic` then trusts anything they load. The rest of
 * the security headers live in next.config.ts.
 *
 * `style-src` keeps `'unsafe-inline'`: the UI relies on React inline `style`
 * props (progress bars, sparklines) and there is no nonce plumbing for styles.
 *
 * (Next 16 renamed the `middleware` convention to `proxy`.)
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Same-origin check for state-changing requests. The session cookie is
 * `SameSite=lax`, which already blocks most cross-site sends, but form-encoded
 * and multipart POSTs (e.g. the document upload) can still be driven by an
 * auto-submitting cross-site form. Reject anything whose `Origin` isn't us.
 */
function isCrossSiteWrite(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false; // non-CORS clients (curl, server-to-server, cron) send none
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

export function proxy(request: NextRequest) {
  if (isCrossSiteWrite(request)) {
    return NextResponse.json(
      { error: { code: "CROSS_ORIGIN", message: "Origen no permitido" } },
      { status: 403 },
    );
  }

  const nonce = btoa(`${crypto.randomUUID()}${crypto.randomUUID()}`);
  const isProd = process.env.NODE_ENV === "production";

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isProd ? "" : "'unsafe-eval'"}`.trim(),
    "connect-src 'self'",
    "form-action 'self'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on every route except Next's static assets and common file assets.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
