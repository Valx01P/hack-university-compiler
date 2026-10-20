// Every query on notifications: in-app messages for a user, such as "your event was cancelled".
// Rows are written in the same transaction as the change they describe.
import { desc, eq } from "drizzle-orm";
import { notifications } from "../../db/schema.ts";
import type { DbOrTx } from "../../db/tx.ts";

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = Pick<Notification, "userId" | "kind" | "payload">;

export interface NotificationsRepository {
  insertMany(db: DbOrTx, rows: NewNotification[]): Promise<number>;
  listForUser(db: DbOrTx, userId: number, limit: number): Promise<Notification[]>;
}

export const notificationsRepository: NotificationsRepository = {
  async insertMany(db, rows) {
    if (rows.length === 0) return 0;
    const inserted = await db.insert(notifications).values(rows).returning({ id: notifications.id });
    return inserted.length;
  },

  async listForUser(db, userId, limit) {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);
  },
};
