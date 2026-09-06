import { requireUser } from "@/lib/auth";
import { apiError, ok } from "@/lib/http";
import { parseBody, notificationPrefsSchema } from "@/lib/schema";
import { getNotificationPrefs, setNotificationPrefs } from "@/lib/notifications";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ prefs: await getNotificationPrefs(user.id) });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const b = await parseBody(request, notificationPrefsSchema);
    return ok({ prefs: await setNotificationPrefs(user.id, b) });
  } catch (e) {
    return apiError(e);
  }
}
