import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { hasDb, pool, migrate, reset } from "./setup";
import {
  notifyInApp,
  notifyInAppOnce,
  notificationInbox,
  unreadCount,
  unreadByCategory,
  markAllNotificationsRead,
  markNotificationsRead,
  getNotificationPrefs,
  setNotificationPrefs,
} from "../../src/lib/notifications";

const d = hasDb ? describe : describe.skip;

beforeAll(() => {
  if (hasDb) migrate();
});
beforeEach(async () => {
  if (hasDb) await reset();
});
afterAll(async () => {
  if (hasDb) await pool.end();
});

async function makeUser(role = "ADMIN") {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users(email,name,role,password_hash,active)
     VALUES ($1,'U',$2,'x',true) RETURNING id`,
    [`u${Math.random().toString(36).slice(2)}@test.local`, role],
  );
  return rows[0].id;
}

d("notification center", () => {
  it("feeds the inbox, counts unread and marks read (all / by id)", async () => {
    const u = await makeUser();
    await notifyInApp(u, "Factura vencida", "Balance 5000", null, {}, "BILLING");
    await notifyInApp(u, "Nuevo ticket", "URGENTE", null, {}, "SUPPORT");
    await notifyInApp(u, "SLA en riesgo", "…", null, {}, "SUPPORT");

    expect(await unreadCount(u)).toBe(3);
    expect(await unreadByCategory(u)).toEqual({ BILLING: 1, SUPPORT: 2 });

    const all = await notificationInbox(u, {});
    expect(all).toHaveLength(3);
    expect(all[0].title).toBe("SLA en riesgo"); // newest first

    const support = await notificationInbox(u, { category: "SUPPORT" });
    expect(support).toHaveLength(2);

    // Mark one by id.
    const marked1 = await markNotificationsRead(u, [support[0].id]);
    expect(marked1).toBe(1);
    expect(await unreadCount(u)).toBe(2);
    expect(await notificationInbox(u, { filter: "unread" })).toHaveLength(2);

    // Mark the rest of a category.
    const markedCat = await markAllNotificationsRead(u, "SUPPORT");
    expect(markedCat).toBe(1); // the other SUPPORT one; the BILLING stays
    expect(await unreadCount(u)).toBe(1);

    const markedAll = await markAllNotificationsRead(u);
    expect(markedAll).toBe(1);
    expect(await unreadCount(u)).toBe(0);
    // Idempotent — nothing left to mark.
    expect(await markAllNotificationsRead(u)).toBe(0);
  });

  it("a muted category is never written to that user's inbox", async () => {
    const u = await makeUser();
    const prefs = await setNotificationPrefs(u, { mutedCategories: ["BILLING"] });
    expect(prefs.mutedCategories).toEqual(["BILLING"]);

    const dropped = await notifyInApp(u, "Factura vencida", "…", null, {}, "BILLING");
    expect(dropped).toBeNull();
    const kept = await notifyInApp(u, "Nuevo ticket", "…", null, {}, "SUPPORT");
    expect(kept).toBeTruthy();

    // notifyInAppOnce respects the mute too.
    expect(await notifyInAppOnce(u, "overdue:x", "Vencida", "…", null, "BILLING")).toBeNull();

    expect(await unreadCount(u)).toBe(1);
    expect((await notificationInbox(u, {})).map((n) => n.category)).toEqual(["SUPPORT"]);

    // Un-mute and the next one lands.
    await setNotificationPrefs(u, { mutedCategories: [] });
    expect(await notifyInApp(u, "Otra factura", "…", null, {}, "BILLING")).toBeTruthy();
    expect(await unreadCount(u)).toBe(2);
  });

  it("prefs default sensibly and reject unknown categories", async () => {
    const u = await makeUser();
    expect(await getNotificationPrefs(u)).toEqual({
      emailEnabled: true,
      whatsappEnabled: true,
      mutedCategories: [],
    });
    const saved = await setNotificationPrefs(u, {
      emailEnabled: false,
      mutedCategories: ["SUPPORT", "NONSENSE" as never, "SUPPORT"],
    });
    expect(saved.emailEnabled).toBe(false);
    expect(saved.whatsappEnabled).toBe(true);
    expect(saved.mutedCategories).toEqual(["SUPPORT"]); // deduped, unknown dropped
  });

  it("one user's mute does not affect another user", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await setNotificationPrefs(a, { mutedCategories: ["BILLING"] });
    await notifyInApp(a, "x", "…", null, {}, "BILLING");
    await notifyInApp(b, "x", "…", null, {}, "BILLING");
    expect(await unreadCount(a)).toBe(0);
    expect(await unreadCount(b)).toBe(1);
  });
});
