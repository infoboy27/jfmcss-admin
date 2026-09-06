import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { invoicePdf } from "@/lib/pdf";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=await requireUser();
    const{id}=await params;
    const inv=(await query<any>(`SELECT i.*,c.name client_name,c.tax_id FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.id=$1`,[id])).rows[0];
    if(!inv)return new Response('No encontrada',{status:404});
    if(user.role==='CLIENT'&&inv.client_id!==user.clientId)throw new Error('FORBIDDEN');
    const items=(await query<any>(`SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position`,[id])).rows;
    const pdf=await invoicePdf(inv,items);
    const body=Uint8Array.from(pdf).buffer as ArrayBuffer;
    return new Response(body,{headers:{'content-type':'application/pdf','content-disposition':`inline; filename="${inv.number}.pdf"`}});
  }catch(e){return apiError(e)}
}
