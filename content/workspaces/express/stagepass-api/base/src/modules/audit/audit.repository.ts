// Every query on audit_log: who did what to which record, and when.
import { and, asc, eq } from "drizzle-orm";
import { auditLog } from "../../db/schema.ts";
import type { DbOrTx } from "../../db/tx.ts";

export type AuditEntry = typeof auditLog.$inferSelect;
export type NewAuditEntry = Pick<AuditEntry, "actorId" | "action" | "entity" | "entityId" | "data">;

export interface AuditRepository {
  insert(db: DbOrTx, entry: NewAuditEntry): Promise<void>;
  listForEntity(db: DbOrTx, entity: string, entityId: number): Promise<AuditEntry[]>;
}

export const auditRepository: AuditRepository = {
  async insert(db, entry) {
    await db.insert(auditLog).values(entry);
  },

  async listForEntity(db, entity, entityId) {
    return db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, entity), eq(auditLog.entityId, entityId)))
      .orderBy(asc(auditLog.id));
  },
};
