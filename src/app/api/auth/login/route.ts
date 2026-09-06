import { NextResponse } from "next/server";
import { bootstrapIfNeeded, createSession, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, text } from "@/lib/http";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { headers } from "next/headers";

const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT || 10);
const WINDOW_SECONDS = Number(process.env.LOGIN_RATE_WINDOW_SECONDS || 300);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = text(body.email, 254).toLowerCase();
    const password = text(body.password, 500);
    if (!email || !password) {
      return NextResponse.json({ error: "Correo y contraseña son requeridos" }, { status: 400 });
    }

    // Rate limit per IP and per targeted account to slow credential stuffing /
    // password spraying without locking a victim out globally.
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    for (const key of [`login:ip:${ip}`, `login:acct:${email}`]) {
      const rl = rateLimit(key, MAX_ATTEMPTS, WINDOW_SECONDS);
      if (!rl.ok) {
        return NextResponse.json(
          { error: "Demasiados intentos. Intenta de nuevo más tarde." },
          { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
        );
      }
    }

    await bootstrapIfNeeded(email, password);
    const { rows } = await query<{ id: string; email: string; name: string; password_hash: string; role: string; active: boolean }>(
      `SELECT id,email,name,password_hash,role,active FROM users WHERE lower(email)=lower($1) LIMIT 1`,
      [email],
    );
    const user = rows[0];
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      await audit(user?.id ?? null, "LOGIN_FAILED", "SESSION", null, { email });
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }
    await createSession(user.id);
    await audit(user.id, "LOGIN", "SESSION", null, { email: user.email });
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    return apiError(error);
  }
}
