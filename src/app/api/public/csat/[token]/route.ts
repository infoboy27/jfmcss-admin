import { apiError, ok, fail } from "@/lib/http";
import { parseBody, csatSubmitSchema } from "@/lib/schema";
import { rateLimit } from "@/lib/ratelimit";
import { csatView, submitCsat } from "@/lib/csat";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const view = await csatView(token);
    if (!view) return fail("NOT_FOUND", "Encuesta no encontrada", 404);
    return ok(view);
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const rl = rateLimit(`csat:${token}`, 6, 3600);
    if (!rl.ok) return fail("RATE_LIMITED", "Demasiados intentos", 429);
    const b = await parseBody(request, csatSubmitSchema);
    return ok(await submitCsat(token, b));
  } catch (e) {
    return apiError(e);
  }
}
