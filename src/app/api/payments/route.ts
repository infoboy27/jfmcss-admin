import { requireUser } from "@/lib/auth";
import { query, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/notifications";
import { apiError, ok } from "@/lib/http";
import { parseBody, paymentCreateSchema } from "@/lib/schema";
import { fireAutomations } from "@/lib/automations";
import { readPage, pageMeta } from "@/lib/pagination";

export async function GET(request:Request){try{const user=await requireUser();const p:unknown[]=[];let where='';if(user.role==='CLIENT'){where='WHERE pay.client_id=$1';p.push(user.clientId)}const page=readPage(request,{defaultLimit:500,maxLimit:1000});const[res,count]=await Promise.all([query(`SELECT pay.*,c.name client_name,i.number invoice_number FROM payments pay JOIN clients c ON c.id=pay.client_id LEFT JOIN invoices i ON i.id=pay.invoice_id ${where} ORDER BY pay.paid_at DESC LIMIT ${page.limit} OFFSET ${page.offset}`,p),query<{n:string}>(`SELECT count(*)::text n FROM payments pay ${where}`,p)]);return ok({payments:res.rows,...pageMeta(res.rows.length,Number(count.rows[0].n),page)})}catch(e){return apiError(e)}}

export async function POST(request:Request){try{
  const user=await requireUser(['SUPER_ADMIN','ADMIN','FINANCE']);
  const b=await parseBody(request, paymentCreateSchema);
  const amount=Math.round(b.amount*100)/100;
  const { payment, invoice } = await tx(async c=>{
    const{rows}=await c.query<Record<string,unknown> & {id:string}>(
      `INSERT INTO payments(invoice_id,client_id,amount,currency,method,reference,paid_at,notes,created_by)
       VALUES($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz,now()),$8,$9) RETURNING *`,
      [b.invoiceId??null,b.clientId,amount,b.currency??'DOP',b.method??'TRANSFER',b.reference??null,b.paidAt??null,b.notes??null,user.id]);
    let invoice: Record<string,unknown> | null = null;
    if(b.invoiceId){
      // Reconcile against the invoice this payment belongs to; keep the balance
      // from going negative and flip the status to PARTIAL/PAID accordingly.
      const upd = await c.query<Record<string,unknown>>(
        `UPDATE invoices
            SET paid_amount=least(total,paid_amount+$2),
                status=CASE WHEN paid_amount+$2>=total THEN 'PAID' ELSE 'PARTIAL' END,
                updated_at=now()
          WHERE id=$1 AND client_id=$3 AND status NOT IN ('VOID','DRAFT')
        RETURNING number,total,status`,
        [b.invoiceId,amount,b.clientId]);
      invoice = upd.rows[0] ?? null;
    }
    return { payment: rows[0], invoice };
  });
  const client=(await query<{name:string;email:string|null}>(`SELECT name,email FROM clients WHERE id=$1`,[b.clientId])).rows[0];
  if(client?.email)await sendEmail(client.email,'Pago recibido · JFMCSS',`<p>Hola ${client.name},</p><p>Confirmamos la recepción de tu pago por <strong>RD$${amount.toLocaleString('en-US',{minimumFractionDigits:2})}</strong>.</p><p>Gracias por confiar en JFMCSS.</p>`,b.clientId).catch(()=>null);
  await audit(user.id,'CREATE','PAYMENT',payment.id,payment);
  fireAutomations("payment.received", {
    id: payment.id, amount, method: b.method ?? "TRANSFER",
    invoiceNumber: (invoice?.number as string) ?? null,
    clientId: b.clientId, clientName: client?.name ?? null, clientEmail: client?.email ?? null,
  });
  if (invoice?.status === "PAID") {
    fireAutomations("invoice.paid", {
      id: b.invoiceId, number: invoice.number, total: Number(invoice.total),
      clientId: b.clientId, clientName: client?.name ?? null, clientEmail: client?.email ?? null,
    });
  }
  return ok({payment}, 201);
}catch(e){return apiError(e)}}
