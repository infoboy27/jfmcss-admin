import { text, numberValue } from "./validate";

export type InvoiceItemInput = {
  description?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  taxRate?: unknown;
};

export type NormalizedInvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  position: number;
};

export type InvoiceTotals = {
  items: NormalizedInvoiceItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Turns raw request line items into validated, money-rounded invoice lines and
 * the document totals. Pure and deterministic so it can be unit-tested and
 * reused by recurring billing.
 *
 * `discount` is an invoice-level amount that reduces the taxable base
 * proportionally across lines, matching how DGII expects "descuento global" to
 * be reflected in the ITBIS calculation.
 */
export function calculateInvoice(rawItems: unknown, rawDiscount: unknown): InvoiceTotals {
  const list = Array.isArray(rawItems) ? rawItems : [];
  if (list.length === 0) {
    throw Object.assign(new Error("La factura requiere al menos una línea"), { status: 400 });
  }

  const base = list.map((raw, i) => {
    const item = (raw ?? {}) as InvoiceItemInput;
    const quantity = Math.max(0, numberValue(item.quantity, 1));
    const unitPrice = Math.max(0, numberValue(item.unitPrice, 0));
    const taxRate = Math.max(0, numberValue(item.taxRate, 18));
    const gross = round2(quantity * unitPrice);
    return {
      description: text(item.description, 500) || `Línea ${i + 1}`,
      quantity,
      unitPrice,
      taxRate,
      gross,
      position: i,
    };
  });

  const grossSubtotal = round2(base.reduce((s, x) => s + x.gross, 0));
  const discount = Math.min(grossSubtotal, Math.max(0, round2(numberValue(rawDiscount, 0))));
  const discountFactor = grossSubtotal > 0 ? (grossSubtotal - discount) / grossSubtotal : 1;

  let allocatedDiscount = 0;
  const items: NormalizedInvoiceItem[] = base.map((x, idx) => {
    // Distribute the global discount across lines, giving the last line the
    // rounding remainder so the parts always sum back to `discount`.
    const isLast = idx === base.length - 1;
    const lineDiscount = isLast
      ? round2(discount - allocatedDiscount)
      : round2(x.gross * (1 - discountFactor));
    allocatedDiscount = round2(allocatedDiscount + lineDiscount);

    const lineSubtotal = round2(x.gross - lineDiscount);
    const lineTax = round2(lineSubtotal * (x.taxRate / 100));
    return {
      description: x.description,
      quantity: x.quantity,
      unitPrice: x.unitPrice,
      taxRate: x.taxRate,
      lineSubtotal,
      lineTax,
      lineTotal: round2(lineSubtotal + lineTax),
      position: x.position,
    };
  });

  const subtotal = round2(items.reduce((s, x) => s + x.lineSubtotal, 0));
  const tax = round2(items.reduce((s, x) => s + x.lineTax, 0));
  const total = round2(subtotal + tax);
  return { items, subtotal, tax, discount, total };
}
