import { describe, it, expect } from "vitest";
import { calculateInvoice } from "../src/lib/billing";

describe("calculateInvoice", () => {
  it("computes subtotal, ITBIS and total for a single line", () => {
    const r = calculateInvoice([{ description: "Servicio", quantity: 1, unitPrice: 30000, taxRate: 18 }], 0);
    expect(r.subtotal).toBe(30000);
    expect(r.tax).toBe(5400);
    expect(r.total).toBe(35400);
    expect(r.items[0].lineTotal).toBe(35400);
  });

  it("sums multiple lines with mixed tax rates", () => {
    const r = calculateInvoice(
      [
        { description: "A", quantity: 2, unitPrice: 100, taxRate: 18 },
        { description: "B", quantity: 1, unitPrice: 50, taxRate: 0 },
      ],
      0,
    );
    expect(r.subtotal).toBe(250);
    expect(r.tax).toBe(36);
    expect(r.total).toBe(286);
  });

  it("applies a global discount to the taxable base (not just the total)", () => {
    const r = calculateInvoice([{ description: "Servicio", quantity: 1, unitPrice: 1000, taxRate: 18 }], 100);
    expect(r.discount).toBe(100);
    expect(r.subtotal).toBe(900);
    expect(r.tax).toBe(162); // 18% of 900, not of 1000
    expect(r.total).toBe(1062);
  });

  it("distributes the discount across lines and never loses a cent", () => {
    const r = calculateInvoice(
      [
        { description: "A", quantity: 1, unitPrice: 33.33, taxRate: 18 },
        { description: "B", quantity: 1, unitPrice: 33.33, taxRate: 18 },
        { description: "C", quantity: 1, unitPrice: 33.34, taxRate: 18 },
      ],
      10,
    );
    const allocated = r.items.reduce((s, x) => s + (x.lineSubtotal), 0);
    expect(Math.round(allocated * 100) / 100).toBe(r.subtotal);
    expect(r.subtotal).toBe(90);
  });

  it("clamps a discount larger than the subtotal", () => {
    const r = calculateInvoice([{ description: "x", quantity: 1, unitPrice: 100, taxRate: 18 }], 999);
    expect(r.discount).toBe(100);
    expect(r.subtotal).toBe(0);
    expect(r.tax).toBe(0);
  });

  it("rejects an empty item list", () => {
    expect(() => calculateInvoice([], 0)).toThrow();
    expect(() => calculateInvoice(undefined, 0)).toThrow();
  });

  it("coerces string quantities/prices and floors negatives at zero", () => {
    const r = calculateInvoice([{ description: "x", quantity: "3", unitPrice: "10", taxRate: "18" }], -5);
    expect(r.subtotal).toBe(30);
    expect(r.discount).toBe(0);
  });
});
