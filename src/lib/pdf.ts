import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const money = (v: unknown, currency = "RD$") => `${currency}${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function invoicePdf(invoice: any, items: any[]) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(5/255,7/255,13/255), cyan = rgb(0,202/255,254/255), blue = rgb(16/255,80/255,208/255), white = rgb(.95,.97,1), muted = rgb(.38,.44,.56);
  page.drawRectangle({ x:0,y:0,width:612,height:792,color:rgb(.985,.99,1) });
  page.drawRectangle({ x:0,y:690,width:612,height:102,color:navy });
  page.drawText("JFMCSS", { x:42,y:744,size:24,font:bold,color:white });
  page.drawText("SOFTWARE · CLOUD · AUTOMATION", { x:42,y:724,size:8,font:regular,color:cyan });
  page.drawText("FACTURA", { x:455,y:747,size:10,font:bold,color:cyan });
  page.drawText(invoice.number || "", { x:455,y:726,size:17,font:bold,color:white });
  page.drawRectangle({ x:42,y:660,width:528,height:2,color:blue });
  page.drawText("CLIENTE", { x:42,y:635,size:8,font:bold,color:blue });
  page.drawText(invoice.client_name || "", { x:42,y:614,size:15,font:bold,color:navy });
  page.drawText(`RNC/Cédula: ${invoice.tax_id || "N/D"}`, { x:42,y:596,size:9,font:regular,color:muted });
  page.drawText(`NCF/e-NCF: ${invoice.ncf || "Pendiente"}`, { x:330,y:614,size:9,font:bold,color:navy });
  page.drawText(`Emisión: ${String(invoice.issue_date || "").slice(0,10)}`, { x:330,y:596,size:9,font:regular,color:muted });
  page.drawText(`Vencimiento: ${String(invoice.due_date || "").slice(0,10) || "N/D"}`, { x:445,y:596,size:9,font:regular,color:muted });
  const top = 552;
  page.drawRectangle({ x:42,y:top,width:528,height:28,color:navy });
  [["Descripción",52],["Cant.",348],["Precio",405],["Total",500]].forEach(([t,x])=>page.drawText(String(t),{x:Number(x),y:top+9,size:8,font:bold,color:white}));
  let y = top - 24;
  for (const item of items.slice(0, 12)) {
    page.drawText(String(item.description || "").slice(0,52), { x:52,y,size:9,font:regular,color:navy });
    page.drawText(String(Number(item.quantity || 0)), { x:356,y,size:9,font:regular,color:navy });
    page.drawText(money(item.unit_price), { x:405,y,size:9,font:regular,color:navy });
    page.drawText(money(item.line_total), { x:500,y,size:9,font:bold,color:navy });
    page.drawLine({ start:{x:42,y:y-9},end:{x:570,y:y-9},thickness:.5,color:rgb(.88,.9,.94) });
    y -= 27;
  }
  const totalsY = Math.max(205, y - 18);
  const right = 570;
  const rows: [string, unknown, boolean][] = [["Subtotal",invoice.subtotal,false],["ITBIS",invoice.tax,false],["Descuento",invoice.discount,false],["TOTAL",invoice.total,true]];
  rows.forEach(([label,value,strong],i)=>{
    const yy=totalsY-i*22; page.drawText(label,{x:405,y:yy,size:strong?10:9,font:strong?bold:regular,color:strong?navy:muted});
    page.drawText(money(value),{x:right-70,y:yy,size:strong?11:9,font:strong?bold:regular,color:strong?blue:navy});
  });
  page.drawRectangle({x:42,y:52,width:528,height:68,color:navy});
  page.drawText("Gracias por confiar en JFMCSS",{x:60,y:88,size:12,font:bold,color:white});
  page.drawText("Documento generado por JFMCSS Control",{x:60,y:70,size:8,font:regular,color:muted});
  page.drawText("jfmcss.com",{x:495,y:80,size:9,font:bold,color:cyan});
  return pdf.save();
}
