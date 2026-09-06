import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/* eslint-disable @typescript-eslint/no-explicit-any */

const CY = { navy: rgb(5 / 255, 7 / 255, 13 / 255), cyan: rgb(0, 202 / 255, 254 / 255), blue: rgb(16 / 255, 80 / 255, 208 / 255), white: rgb(0.95, 0.97, 1), muted: rgb(0.38, 0.44, 0.56), rule: rgb(0.88, 0.9, 0.94), paper: rgb(0.985, 0.99, 1) };

const money = (v: unknown, currency = "RD$") =>
  `${currency}${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (v: unknown) => {
  const s = String(v || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "N/D";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

type Ctx = { pdf: PDFDocument; page: PDFPage; regular: PDFFont; bold: PDFFont };

/** Header band + accent rule; returns the y for the next block. */
function header(ctx: Ctx, kicker: string, number: string): number {
  const { page, regular, bold } = ctx;
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: CY.paper });
  page.drawRectangle({ x: 0, y: 712, width: 612, height: 80, color: CY.navy });
  page.drawText("JFMCSS", { x: 42, y: 754, size: 22, font: bold, color: CY.white });
  page.drawText("SOFTWARE · CLOUD · AUTOMATION", { x: 42, y: 736, size: 7.5, font: regular, color: CY.cyan });
  page.drawText(kicker, { x: 612 - 42 - bold.widthOfTextAtSize(kicker, 9), y: 758, size: 9, font: bold, color: CY.cyan });
  page.drawText(number, { x: 612 - 42 - bold.widthOfTextAtSize(number, 15), y: 738, size: 15, font: bold, color: CY.white });
  page.drawRectangle({ x: 42, y: 700, width: 528, height: 2, color: CY.blue });
  return 676;
}

function lineTable(ctx: Ctx, top: number, items: any[]): number {
  const { page, regular, bold } = ctx;
  page.drawRectangle({ x: 42, y: top, width: 528, height: 26, color: CY.navy });
  ([["Descripción", 52], ["Cant.", 356], ["Precio", 410], ["Importe", 502]] as const).forEach(([t, x]) =>
    page.drawText(t, { x, y: top + 8, size: 8, font: bold, color: CY.white }),
  );
  let y = top - 22;
  for (const it of items.slice(0, 16)) {
    page.drawText(String(it.description || "").slice(0, 58), { x: 52, y, size: 9, font: regular, color: CY.navy });
    page.drawText(String(Number(it.quantity ?? 1)), { x: 360, y, size: 9, font: regular, color: CY.navy });
    page.drawText(money(it.unit_price ?? it.unitPrice), { x: 410, y, size: 9, font: regular, color: CY.navy });
    page.drawText(money(it.line_total ?? it.lineTotal), { x: 502, y, size: 9, font: bold, color: CY.navy });
    page.drawLine({ start: { x: 42, y: y - 8 }, end: { x: 570, y: y - 8 }, thickness: 0.5, color: CY.rule });
    y -= 24;
  }
  return y;
}

function totals(ctx: Ctx, y: number, doc: any) {
  const { page, regular, bold } = ctx;
  const rows: [string, unknown, boolean][] = [
    ["Subtotal", doc.subtotal, false],
    ["ITBIS", doc.tax, false],
    ["Descuento", doc.discount, false],
    ["TOTAL", doc.total, true],
  ];
  const baseY = Math.max(190, y - 16);
  rows.forEach(([label, value, strong], i) => {
    const yy = baseY - i * 20;
    page.drawText(label, { x: 402, y: yy, size: strong ? 10 : 9, font: strong ? bold : regular, color: strong ? CY.navy : CY.muted });
    const text = money(value);
    page.drawText(text, {
      x: 570 - (strong ? bold : regular).widthOfTextAtSize(text, strong ? 11 : 9),
      y: yy,
      size: strong ? 11 : 9,
      font: strong ? bold : regular,
      color: strong ? CY.blue : CY.navy,
    });
  });
  return baseY - rows.length * 20;
}

function footer(ctx: Ctx, note: string) {
  const { page, regular, bold } = ctx;
  page.drawRectangle({ x: 42, y: 46, width: 528, height: 60, color: CY.navy });
  page.drawText(note, { x: 60, y: 78, size: 11, font: bold, color: CY.white });
  page.drawText("Documento generado por JFMCSS Control", { x: 60, y: 62, size: 8, font: regular, color: CY.muted });
  page.drawText("jfmcss.com", { x: 570 - regular.widthOfTextAtSize("jfmcss.com", 9), y: 70, size: 9, font: bold, color: CY.cyan });
}

async function newCtx(): Promise<Ctx> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  return { pdf, page, regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
}

export async function invoicePdf(invoice: any, items: any[]) {
  const ctx = await newCtx();
  const { page, regular, bold } = ctx;
  let y = header(ctx, "FACTURA", invoice.number || "");
  page.drawText("CLIENTE", { x: 42, y, size: 8, font: bold, color: CY.blue });
  page.drawText(invoice.client_name || "", { x: 42, y: y - 18, size: 14, font: bold, color: CY.navy });
  page.drawText(`RNC/Cédula: ${invoice.tax_id || "N/D"}`, { x: 42, y: y - 34, size: 9, font: regular, color: CY.muted });
  page.drawText(`NCF/e-NCF: ${invoice.ncf || "Pendiente"}`, { x: 330, y: y - 18, size: 9, font: bold, color: CY.navy });
  page.drawText(`Emisión: ${shortDate(invoice.issue_date)}`, { x: 330, y: y - 34, size: 9, font: regular, color: CY.muted });
  page.drawText(`Vence: ${shortDate(invoice.due_date)}`, { x: 445, y: y - 34, size: 9, font: regular, color: CY.muted });
  y = lineTable(ctx, y - 56, items);
  y = totals(ctx, y, invoice);
  if (invoice.notes) page.drawText(String(invoice.notes).slice(0, 110), { x: 42, y: Math.max(120, y), size: 8, font: regular, color: CY.muted });
  footer(ctx, "Gracias por confiar en JFMCSS");
  return ctx.pdf.save();
}

export async function proposalPdf(proposal: any, items: any[], milestones: any[] = []) {
  const ctx = await newCtx();
  const { page, regular, bold } = ctx;
  let y = header(ctx, "PROPUESTA", proposal.number || "");
  page.drawText("PREPARADA PARA", { x: 42, y, size: 8, font: bold, color: CY.blue });
  page.drawText(proposal.client_name || proposal.client || "", { x: 42, y: y - 18, size: 14, font: bold, color: CY.navy });
  page.drawText(`Válida hasta: ${shortDate(proposal.valid_until ?? proposal.validUntil)}`, { x: 330, y: y - 18, size: 9, font: regular, color: CY.muted });
  page.drawText(String(proposal.title || "").slice(0, 74), { x: 42, y: y - 38, size: 11, font: bold, color: CY.navy });
  if (proposal.summary) {
    String(proposal.summary)
      .slice(0, 320)
      .match(/.{1,92}(\s|$)/g)
      ?.slice(0, 3)
      .forEach((ln: string, i: number) => page.drawText(ln.trim(), { x: 42, y: y - 54 - i * 12, size: 8.5, font: regular, color: CY.muted }));
  }
  y = lineTable(ctx, y - 100, items);
  y = totals(ctx, y, proposal);
  const terms = proposal.payment_terms ?? proposal.paymentTerms;
  if (milestones.length || terms) {
    page.drawText("FORMA DE PAGO", { x: 42, y: Math.max(150, y), size: 8, font: bold, color: CY.blue });
    let my = Math.max(150, y) - 14;
    if (terms) { page.drawText(String(terms).slice(0, 90), { x: 42, y: my, size: 8.5, font: regular, color: CY.navy }); my -= 12; }
    for (const m of milestones.slice(0, 4)) {
      const pct = m.percentage != null ? ` (${Number(m.percentage)}%)` : "";
      page.drawText(`· ${m.label}${pct} — ${money(m.amount)}`, { x: 42, y: my, size: 8.5, font: regular, color: CY.navy });
      my -= 12;
    }
  }
  footer(ctx, "Esperamos trabajar contigo");
  return ctx.pdf.save();
}
