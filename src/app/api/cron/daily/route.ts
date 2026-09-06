import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { notifyInApp, sendEmail } from "@/lib/notifications";

export async function POST(request:Request){const auth=request.headers.get('authorization');if(!process.env.CRON_SECRET||auth!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});
  const team=(await query<{id:string;email:string}>(`SELECT id,email FROM users WHERE active=true AND role IN ('SUPER_ADMIN','ADMIN','FINANCE','SUPPORT')`)).rows;
  const overdue=(await query<any>(`UPDATE invoices SET status='OVERDUE',updated_at=now() WHERE due_date<CURRENT_DATE AND status IN ('ISSUED','PARTIAL') RETURNING id,number,client_id,total,paid_amount`)).rows;
  const dueSoon=(await query<any>(`SELECT i.id,i.number,i.client_id,i.total,i.paid_amount,c.name,c.email FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.status IN ('ISSUED','PARTIAL') AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+3`)).rows;
  const renewals=(await query<any>(`SELECT a.id,a.name,a.type,a.renewal_date,a.client_id,c.name client_name FROM assets a JOIN clients c ON c.id=a.client_id WHERE a.status='ACTIVE' AND a.renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30`)).rows;
  for(const inv of overdue){for(const u of team)await notifyInApp(u.id,`Factura vencida ${inv.number}`,`Balance RD$${Number(inv.total-inv.paid_amount).toLocaleString('en-US')}`,inv.client_id,{invoiceId:inv.id});}
  for(const inv of dueSoon){if(inv.email)await sendEmail(inv.email,`Recordatorio de factura ${inv.number}`,`<p>Hola ${inv.name},</p><p>Tu factura ${inv.number} vence próximamente. Balance: <strong>RD$${Number(inv.total-inv.paid_amount).toLocaleString('en-US',{minimumFractionDigits:2})}</strong>.</p>`,inv.client_id).catch(()=>null)}
  for(const a of renewals){for(const u of team)await notifyInApp(u.id,`Renovación próxima: ${a.name}`,`${a.client_name} · ${a.type} · ${String(a.renewal_date).slice(0,10)}`,a.client_id,{assetId:a.id});}
  const sla=(await query<any>(`SELECT id,number,client_id,subject FROM tickets WHERE status NOT IN ('RESOLVED','CLOSED') AND sla_due_at<now()+interval '2 hours'`)).rows;for(const t of sla){for(const u of team)await notifyInApp(u.id,`SLA en riesgo ${t.number}`,t.subject,t.client_id,{ticketId:t.id});}
  return NextResponse.json({ok:true,overdue:overdue.length,dueSoon:dueSoon.length,renewals:renewals.length,slaRisk:sla.length});}
