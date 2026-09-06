import { describe, it, expect } from "vitest";
import {
  parseBody,
  invoiceCreateSchema,
  paymentCreateSchema,
  userCreateSchema,
} from "../src/lib/schema";

const req = (body: unknown) =>
  new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("parseBody", () => {
  it("rejects a non-JSON body with a 400 ApiError", async () => {
    const bad = new Request("http://x", { method: "POST", body: "not json" });
    await expect(parseBody(bad, invoiceCreateSchema)).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
  });

  it("surfaces the offending field path in the message", async () => {
    await expect(parseBody(req({ items: [] }), invoiceCreateSchema)).rejects.toThrow(/clientId|items/);
  });
});

describe("invoiceCreateSchema", () => {
  const clientId = "11111111-1111-1111-1111-111111111111";

  it("accepts a minimal valid invoice and coerces string numbers", async () => {
    const v = await parseBody(
      req({ clientId, items: [{ description: "Svc", quantity: "2", unitPrice: "100", taxRate: "18" }] }),
      invoiceCreateSchema,
    );
    expect(v.items[0].quantity).toBe(2);
    expect(v.items[0].unitPrice).toBe(100);
  });

  it("requires at least one line item", async () => {
    await expect(parseBody(req({ clientId, items: [] }), invoiceCreateSchema)).rejects.toThrow();
  });

  it("rejects an unknown fiscal type", async () => {
    await expect(
      parseBody(req({ clientId, items: [{ unitPrice: 1 }], fiscalType: "Z99" }), invoiceCreateSchema),
    ).rejects.toThrow();
  });

  it("rejects a non-uuid clientId", async () => {
    await expect(parseBody(req({ clientId: "42", items: [{ unitPrice: 1 }] }), invoiceCreateSchema)).rejects.toThrow();
  });
});

describe("paymentCreateSchema", () => {
  const clientId = "11111111-1111-1111-1111-111111111111";
  it("rejects a zero or negative amount", async () => {
    await expect(parseBody(req({ clientId, amount: 0 }), paymentCreateSchema)).rejects.toThrow();
    await expect(parseBody(req({ clientId, amount: -5 }), paymentCreateSchema)).rejects.toThrow();
  });
  it("accepts a positive amount and a known method", async () => {
    const v = await parseBody(req({ clientId, amount: "1500.50", method: "TRANSFER" }), paymentCreateSchema);
    expect(v.amount).toBe(1500.5);
  });
});

describe("userCreateSchema", () => {
  it("enforces a 10-char minimum password", async () => {
    await expect(
      parseBody(req({ email: "a@b.com", name: "A", password: "short" }), userCreateSchema),
    ).rejects.toThrow(/contraseña/);
  });
});
