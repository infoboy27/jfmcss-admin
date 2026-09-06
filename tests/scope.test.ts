import { describe, it, expect } from "vitest";
import { assertClientAccess, clientScope, resolveClientId, isClient } from "../src/lib/scope";
import type { SessionUser } from "../src/lib/auth";

const staff = (role: SessionUser["role"]): SessionUser => ({ id: "u1", email: "s@x", name: "S", role, clientId: null });
const client = (clientId: string | null): SessionUser => ({ id: "u2", email: "c@x", name: "C", role: "CLIENT", clientId });

const ACME = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("assertClientAccess", () => {
  it("never blocks staff regardless of the row's client", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "FINANCE", "PM", "SUPPORT"] as const) {
      expect(() => assertClientAccess(staff(role), OTHER)).not.toThrow();
      expect(() => assertClientAccess(staff(role), null)).not.toThrow();
    }
  });

  it("lets a CLIENT reach only their own client's rows", () => {
    expect(() => assertClientAccess(client(ACME), ACME)).not.toThrow();
  });

  it("blocks a CLIENT from another client's rows", () => {
    expect(() => assertClientAccess(client(ACME), OTHER)).toThrow(/permisos/i);
  });

  it("blocks a CLIENT whose own clientId is missing, and unowned rows", () => {
    expect(() => assertClientAccess(client(null), ACME)).toThrow();
    expect(() => assertClientAccess(client(ACME), null)).toThrow();
    expect(() => assertClientAccess(client(ACME), undefined)).toThrow();
  });

  it("throws a 403 ApiError (not a bare Error)", () => {
    try {
      assertClientAccess(client(ACME), OTHER);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as { status: number; code: string }).status).toBe(403);
      expect((e as { code: string }).code).toBe("FORBIDDEN");
    }
  });
});

describe("clientScope", () => {
  it("is a no-op for staff", () => {
    expect(clientScope(staff("ADMIN"), "i.client_id")).toEqual({ where: "", params: [], nextParam: 1 });
  });
  it("emits a bound WHERE for a CLIENT at the requested param index", () => {
    expect(clientScope(client(ACME), "i.client_id", 3)).toEqual({
      where: "WHERE i.client_id = $3",
      params: [ACME],
      nextParam: 4,
    });
  });
});

describe("resolveClientId", () => {
  it("forces a CLIENT to their own id, ignoring the request", () => {
    expect(resolveClientId(client(ACME), OTHER)).toBe(ACME);
  });
  it("passes the requested id through for staff", () => {
    expect(resolveClientId(staff("PM"), OTHER)).toBe(OTHER);
    expect(resolveClientId(staff("PM"), null)).toBeNull();
  });
});

describe("isClient", () => {
  it("is true only for the CLIENT role", () => {
    expect(isClient(client(ACME))).toBe(true);
    expect(isClient(staff("SUPPORT"))).toBe(false);
  });
});
