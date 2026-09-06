import { z } from "zod";
import { ApiError } from "./errors";

/**
 * Zod schemas for request bodies. TypeScript only checks the shape the code
 * *expects*; these check what actually arrived over HTTP. Kept deliberately
 * lenient about types (the UI posts numbers as strings) but strict about
 * required fields, enums and lengths.
 */

/** Parse a JSON request body against `schema`, or throw a 400 ApiError. */
export async function parseBody<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("VALIDATION", "El cuerpo de la solicitud debe ser JSON válido", 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".");
    throw new ApiError("VALIDATION", path ? `${path}: ${first.message}` : first.message, 400);
  }
  return result.data;
}

// ─── reusable fields ────────────────────────────────────────────────────────
const trimmed = (max: number) => z.string().trim().max(max);
const reqStr = (max: number, msg = "requerido") => trimmed(max).min(1, msg);
const optStr = (max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), trimmed(max).optional());
const id = z.string().uuid("id inválido");
const optId = z.preprocess((v) => (v === "" || v == null ? undefined : v), id.optional());
const money = z.coerce.number().finite().min(0).catch(0);
const isoDate = z.preprocess(
  (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined),
  z.string().optional(),
);
const bool = z.coerce.boolean();

// ─── auth ───────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: reqStr(254, "correo requerido"),
  password: reqStr(500, "contraseña requerida"),
});

// ─── clients / contacts ─────────────────────────────────────────────────────
export const clientCreateSchema = z.object({
  name: reqStr(200, "nombre requerido"),
  code: optStr(40),
  legalName: optStr(200),
  taxId: optStr(40),
  email: optStr(254),
  phone: optStr(40),
  website: optStr(300),
  address: optStr(500),
  city: optStr(100),
  country: optStr(100),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).catch(30),
  status: z.enum(["LEAD", "ACTIVE", "PAUSED", "INACTIVE"]).optional(),
  notes: optStr(4000),
  tags: z.array(z.string().max(40)).max(30).optional(),
});
export const clientUpdateSchema = clientCreateSchema.partial().extend({
  healthScore: z.coerce.number().int().min(0).max(100).optional(),
});
export const contactCreateSchema = z.object({
  clientId: optId,
  name: reqStr(200, "nombre requerido"),
  email: optStr(254),
  phone: optStr(50),
  title: optStr(120),
  isPrimary: bool.optional(),
});
export const contactUpdateSchema = z.object({
  name: optStr(200),
  email: optStr(254),
  phone: optStr(50),
  title: optStr(120),
  isPrimary: z.boolean().optional(),
});
const notificationCategory = z.enum(["SYSTEM", "BILLING", "SUPPORT", "SALES", "RENEWAL", "PROJECT"]);
/** Mark one (`id`), several (`ids`), or a whole category / everything (`all`). */
export const notificationPatchSchema = z
  .object({
    id: optId,
    ids: z.array(id).max(500).optional(),
    all: z.boolean().optional(),
    category: notificationCategory.optional(),
  })
  .refine((v) => v.id || v.ids?.length || v.all, "nada que marcar");
export const notificationPrefsSchema = z.object({
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  mutedCategories: z.array(notificationCategory).max(6).optional(),
});

// ─── sales / projects / tasks ───────────────────────────────────────────────
export const opportunityCreateSchema = z.object({
  clientId: optId,
  title: reqStr(250, "título requerido"),
  stage: z.enum(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]).optional(),
  amount: money,
  probability: z.coerce.number().int().min(0).max(100).catch(25),
  expectedClose: isoDate,
  ownerId: optId,
  nextAction: optStr(1000),
  notes: optStr(5000),
});
export const projectCreateSchema = z.object({
  clientId: id,
  name: reqStr(200, "nombre requerido"),
  code: optStr(50),
  description: optStr(5000),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  progress: z.coerce.number().int().min(0).max(100).catch(0),
  budget: money,
  internalCost: money,
  recurringRevenue: money,
  startDate: isoDate,
  dueDate: isoDate,
  ownerId: optId,
  repositoryUrl: optStr(500),
  productionUrl: optStr(500),
  environment: z.record(z.string(), z.unknown()).optional(),
});
export const taskCreateSchema = z.object({
  projectId: id,
  title: reqStr(300, "título requerido"),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: optId,
  dueDate: isoDate,
});
export const taskUpdateSchema = z.object({
  title: optStr(300),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: optId,
  dueDate: isoDate,
});

// ─── billing / payments ─────────────────────────────────────────────────────
export const invoiceItemSchema = z.object({
  description: optStr(500),
  quantity: z.coerce.number().min(0).catch(1),
  unitPrice: money,
  taxRate: z.coerce.number().min(0).max(100).catch(18),
});
export const invoiceCreateSchema = z.object({
  clientId: id,
  projectId: optId,
  items: z.array(invoiceItemSchema).min(1, "al menos una línea"),
  discount: money,
  issue: bool.optional(),
  fiscalType: z.enum(["E31", "E32", "E33", "E34", "B01", "B02", "B04", "B14", "B15"]).optional(),
  currency: z.enum(["DOP", "USD", "EUR"]).optional(),
  issueDate: isoDate,
  dueDate: isoDate,
  notes: optStr(4000),
});
export const invoiceActionSchema = z.object({
  action: z.enum(["ISSUE", "VOID"]),
  fiscalType: z.string().max(10).optional(),
});
export const paymentCreateSchema = z.object({
  clientId: id,
  invoiceId: optId,
  amount: z.coerce.number().positive("el monto debe ser mayor que cero"),
  currency: z.enum(["DOP", "USD", "EUR"]).optional(),
  method: z.enum(["TRANSFER", "CASH", "CARD", "CHECK", "OTHER"]).optional(),
  reference: optStr(200),
  paidAt: optStr(40),
  notes: optStr(2000),
});

// ─── proposals ──────────────────────────────────────────────────────────────
const milestoneSchema = z.object({
  label: reqStr(120, "etiqueta requerida"),
  percentage: z.coerce.number().min(0).max(100).optional(),
  amount: z.coerce.number().min(0).optional(),
});
export const proposalCreateSchema = z.object({
  clientId: id,
  opportunityId: optId,
  title: reqStr(250, "título requerido"),
  summary: optStr(4000),
  currency: z.enum(["DOP", "USD", "EUR"]).optional(),
  items: z.array(invoiceItemSchema).min(1, "al menos una línea"),
  discount: money,
  validUntil: isoDate,
  paymentTerms: optStr(500),
  terms: optStr(8000),
  notes: optStr(4000),
  milestones: z.array(milestoneSchema).max(12).optional(),
});
export const proposalUpdateSchema = proposalCreateSchema.partial().omit({ clientId: true });
export const proposalActionSchema = z.object({
  action: z.enum(["SEND", "ACCEPT", "REJECT", "EXPIRE", "CONVERT"]),
  note: optStr(2000),
  createInitialInvoice: z.boolean().optional(),
});
/** Body a client posts from the public proposal link. */
export const publicDecisionSchema = z.object({
  decision: z.enum(["ACCEPT", "REJECT"]),
  note: optStr(2000),
});

// ─── support ────────────────────────────────────────────────────────────────
export const ticketCreateSchema = z.object({
  clientId: optId,
  projectId: optId,
  subject: reqStr(250, "asunto requerido"),
  description: reqStr(10000, "descripción requerida"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  category: optStr(50),
  assigneeId: optId,
  requesterEmail: optStr(254),
});
export const ticketMessageSchema = z.object({
  body: reqStr(10000, "mensaje requerido"),
  internal: bool.optional(),
  billableMinutes: z.coerce.number().int().min(0).max(24 * 60).catch(0),
});

// ─── assets ─────────────────────────────────────────────────────────────────
export const assetCreateSchema = z.object({
  clientId: id,
  projectId: optId,
  name: reqStr(200, "nombre requerido"),
  type: z.enum(["DOMAIN", "SSL", "CLOUD", "SERVER", "LICENSE", "SAAS", "OTHER"]).optional(),
  provider: optStr(200),
  externalId: optStr(200),
  renewalDate: isoDate,
  recurringCost: money,
  recurringPrice: money,
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "CUSTOM"]).optional(),
  status: z.enum(["ACTIVE", "AT_RISK", "EXPIRED", "CANCELLED"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  // recurring-service fields
  autoInvoice: z.boolean().optional(),
  nextInvoiceDate: isoDate,
  fiscalType: z.enum(["E31", "E32", "E33", "E34", "B01", "B02"]).optional(),
  serviceDescription: optStr(500),
});
export const assetUpdateSchema = assetCreateSchema.partial().omit({ clientId: true });

// ─── admin ──────────────────────────────────────────────────────────────────
export const userCreateSchema = z.object({
  email: reqStr(254, "correo requerido"),
  name: reqStr(200, "nombre requerido"),
  password: z.string().min(10, "la contraseña debe tener al menos 10 caracteres").max(500),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "FINANCE", "PM", "SUPPORT", "CLIENT"]).optional(),
  clientId: optId,
});
export const userUpdateSchema = z.object({
  name: optStr(200),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "FINANCE", "PM", "SUPPORT", "CLIENT"]).optional(),
  active: z.boolean().optional(),
  clientId: optId,
  password: z.union([z.string().min(10).max(500), z.literal("")]).optional(),
});
export const automationCreateSchema = z.object({
  name: reqStr(200, "nombre requerido"),
  event: reqStr(100, "evento requerido"),
  enabled: z.boolean().optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(z.unknown()).optional(),
});
