// Every query on users. Services depend on the UsersRepository interface, so tests can hand
// them an in-memory fake (test/support/fakes.ts) and nothing above this file knows SQL.
import { eq, sql } from "drizzle-orm";
import { users } from "../../db/schema.ts";
import { type DbOrTx, pgConstraint, pgErrorCode } from "../../db/tx.ts";
import { ConflictError } from "../../http/errors.ts";

export type User = typeof users.$inferSelect;
export type NewUser = Pick<User, "email" | "name" | "role" | "passwordHash">;

export interface UsersRepository {
  findById(db: DbOrTx, id: number): Promise<User | null>;
  /** Ignores case: Cam@StagePass.test finds cam@stagepass.test. */
  findByEmail(db: DbOrTx, email: string): Promise<User | null>;
  /** Throws ConflictError when the email is taken. */
  create(db: DbOrTx, user: NewUser): Promise<User>;
  updatePasswordHash(db: DbOrTx, id: number, passwordHash: string): Promise<void>;
}

export const usersRepository: UsersRepository = {
  async findById(db, id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  },

  async findByEmail(db, email) {
    // lower(email) matches the unique index users_email_lower_idx, so this is an index lookup.
    const [user] = await db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()));
    return user ?? null;
  },

  async create(db, user) {
    try {
      const [created] = await db.insert(users).values(user).returning();
      return created as User;
    } catch (err) {
      if (pgErrorCode(err) === "23505" && pgConstraint(err) === "users_email_lower_idx") {
        throw new ConflictError("email-taken", "An account with this email already exists");
      }
      throw err;
    }
  },

  async updatePasswordHash(db, id, passwordHash) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  },
};
