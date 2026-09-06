import { NextResponse } from "next/server";
import { bootstrapIfNeeded, createSession, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, text } from "@/lib/http";
import { audit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = text(body.email, 254).toLowerCase();
    const password = text(body.password, 500);
    if (!email || !password) return NextResponse.json({ error: "Correo y contraseña son requeridos" }, { status: 400 });
    await bootstrapIfNeeded(email, password);
    const { rows } = await query<{ id:string; email:string; name:string; password_hash:string; role:string; active:boolean }>(
      `SELECT id,email,name,password_hash,role,active FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]
    );
    const user = rows[0];
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }
    await createSession(user.id);
    await audit(user.id, "LOGIN", "SESSION", null, { email: user.email });
    return NextResponse.json({ user: { id:user.id,email:user.email,name:user.name,role:user.role } });
  } catch (error) { return apiError(error); }
}
