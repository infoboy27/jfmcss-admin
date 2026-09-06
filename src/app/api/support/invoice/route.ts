import { requireUser } from "@/lib/auth";
import { apiError, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/notifications";
import { parseBody } from "@/lib/schema";
import { invoiceSupportTime } from "@/lib/support-billing";
import { z } from "zod";

const schema = z.object({
  clientId: z.string().uuid(),
  hourlyRate: z.coerce.number().positive().optional(),
  fiscalType: z.enum(["E31", "E32", "B01", "B02"]).optional(),
  issue: z.boolean().optional(),
  perTicket: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const b = await parseBody(request, schema);
    const outcome = await invoiceSupportTime(b.clientId, user.id, b);

    await audit(user.id, "CREATE", "INVOICE", outcome.invoice.id, { source: "SUPPORT", ...outcome.invoice });
    if ((b.issue ?? true) && outcome.client?.email) {
      await sendEmail(
        outcome.client.email,
        `Factura ${outcome.invoice.number} · Soporte · JFMCSS`,
        `<p>Hola ${outcome.client.name},</p><p>Hemos emitido la factura <strong>${outcome.invoice.number}</strong> por soporte técnico (${
          Math.round((outcome.minutes / 60) * 100) / 100
        } h) por RD$${Number(outcome.invoice.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}.</p>`,
        b.clientId,
      );
    }
    return ok(
      { invoice: outcome.invoice, billedEntries: outcome.billedEntries, tickets: outcome.tickets, minutes: outcome.minutes },
      201,
    );
  } catch (e) {
    return apiError(e);
  }
}
