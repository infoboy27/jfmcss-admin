import { requireUser } from "@/lib/auth";
import { apiError, ok } from "@/lib/http";
import { parseBody, notificationPatchSchema } from "@/lib/schema";
import {
  notificationInbox,
  unreadCount,
  unreadByCategory,
  getNotificationPrefs,
  markNotificationsRead,
  markAllNotificationsRead,
} from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") === "unread" ? "unread" : "all";
    const category = url.searchParams.get("category") ?? undefined;
    const before = url.searchParams.get("before") ?? undefined;
    const [notifications, unread, byCategory, prefs] = await Promise.all([
      notificationInbox(user.id, { filter, category, before, limit: 40 }),
      unreadCount(user.id),
      unreadByCategory(user.id),
      getNotificationPrefs(user.id),
    ]);
    return ok({ notifications, unreadCount: unread, unreadByCategory: byCategory, prefs });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const b = await parseBody(request, notificationPatchSchema);
    let marked = 0;
    if (b.all) marked = await markAllNotificationsRead(user.id, b.category);
    else marked = await markNotificationsRead(user.id, [b.id, ...(b.ids ?? [])].filter(Boolean) as string[]);
    return ok({ marked, unreadCount: await unreadCount(user.id) });
  } catch (e) {
    return apiError(e);
  }
}
