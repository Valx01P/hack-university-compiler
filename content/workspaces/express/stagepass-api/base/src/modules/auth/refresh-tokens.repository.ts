// Every query on refresh_tokens. Rows hold a token's hash, never the token itself.
import { and, eq, isNull } from "drizzle-orm";
import { refreshTokens } from "../../db/schema.ts";
import type { DbOrTx, Tx } from "../../db/tx.ts";

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = Pick<RefreshToken, "userId" | "tokenHash" | "familyId" | "expiresAt">;

export interface RefreshTokensRepository {
  create(db: DbOrTx, token: NewRefreshToken): Promise<RefreshToken>;
  findByHash(db: DbOrTx, tokenHash: string): Promise<RefreshToken | null>;
  /** Locks the row until the transaction ends, so two refreshes of one token cannot both win. */
  findByHashForUpdate(tx: Tx, tokenHash: string): Promise<RefreshToken | null>;
  markRotated(tx: Tx, id: number, change: { revokedAt: Date; replacedById: number }): Promise<void>;
  /** Revokes every token still live in a family: the login it came from ends everywhere. */
  revokeFamily(db: DbOrTx, familyId: string, revokedAt: Date): Promise<number>;
}

export const refreshTokensRepository: RefreshTokensRepository = {
  async create(db, token) {
    const [created] = await db.insert(refreshTokens).values(token).returning();
    return created as RefreshToken;
  },

  async findByHash(db, tokenHash) {
    const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    return row ?? null;
  },

  async findByHashForUpdate(tx, tokenHash) {
    const [row] = await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).for("update");
    return row ?? null;
  },

  async markRotated(tx, id, change) {
    await tx.update(refreshTokens).set(change).where(eq(refreshTokens.id, id));
  },

  async revokeFamily(db, familyId, revokedAt) {
    const revoked = await db
      .update(refreshTokens)
      .set({ revokedAt })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    return revoked.length;
  },
};
