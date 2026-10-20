// Password hashing. New hashes are argon2id with OWASP's minimum settings (19 MiB of memory,
// 2 passes, 1 lane), stored as PHC strings that record the algorithm, settings, and salt.
// Older hashes still verify: argon2 with weaker settings, or bcrypt from the ticketing system
// StagePass imported its first customers from. verifyAndUpgrade rehashes those at login.
import * as argon2 from "argon2";
import bcrypt from "bcryptjs";

export const ARGON2_SETTINGS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

// A real argon2id hash of a random password nobody knows. Login verifies against it when the
// email is unknown, so "no such user" takes as long as "wrong password" and timing does not
// reveal who has an account.
export const DUMMY_HASH = "$argon2id$v=19$m=19456,p=1,t=2$ZHsIpv+lsD4FW7cQZGa83Q$hIr3CjYc5ZovvQhjLt4gfPT6rmKvZ6CpRKiWx+9r99E";

const BCRYPT = /^\$2[aby]\$/;

export class PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, ...ARGON2_SETTINGS });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    if (BCRYPT.test(hash)) return bcrypt.compare(password, hash);
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A malformed hash in the database means the password cannot match, not a server error.
      return false;
    }
  }

  /** True for bcrypt hashes and argon2 hashes made with other settings than today's. */
  needsRehash(hash: string): boolean {
    return BCRYPT.test(hash) || argon2.needsRehash(hash, ARGON2_SETTINGS);
  }

  /**
   * Checks a login and, when it is right but the stored hash is outdated, makes a new hash
   * with today's settings for the caller to save. Users never notice the upgrade.
   */
  async verifyAndUpgrade(user: { passwordHash: string }, password: string): Promise<{ valid: boolean; newHash: string | null }> {
    const valid = await this.verify(user.passwordHash, password);
    if (!valid || !this.needsRehash(user.passwordHash)) return { valid, newHash: null };
    return { valid, newHash: await this.hash(password) };
  }
}
