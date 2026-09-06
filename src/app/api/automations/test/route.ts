import { requireUser } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/http";
import { parseBody, automationTestSchema } from "@/lib/schema";
import { EVENTS, previewRule } from "@/lib/automations";

/** Dry run: evaluate an (unsaved) rule against a sample/supplied payload. */
export async function POST(request: Request) {
  try {
    await requireUser(["SUPER_ADMIN", "ADMIN"]);
    const b = await parseBody(request, automationTestSchema);
    const def = EVENTS.find((e) => e.event === b.event);
    if (!def) return fail("VALIDATION", "Evento desconocido", 400);
    const payload = { ...def.sample, ...(b.payload ?? {}) };
    const preview = previewRule({ event: b.event, conditions: b.conditions, actions: b.actions as never }, payload);
    return ok({ ...preview, payload });
  } catch (e) {
    return apiError(e);
  }
}
