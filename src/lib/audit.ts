import { headers } from "next/headers";
import { query } from "./db";

export async function audit(actorId: string | null, action: string, entityType: string, entityId: string | null, afterData?: unknown, beforeData?: unknown) {
  const h = await headers();
  await query(
    `INSERT INTO audit_log(actor_id,action,entity_type,entity_id,before_data,after_data,ip) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [actorId, action, entityType, entityId, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null, h.get("x-forwarded-for")?.split(",")[0]?.trim() || null],
  );
}
