// Signup, login, refresh, and logout. No HTTP here: the controller passes plain values in and
// gets a Session back, and failures are AppErrors the error handler turns into responses.
import { randomUUID } from "node:crypto";
import { now } from "../../clock.ts";
import { type Db, withTx } from "../../db/tx.ts";
import { NotFoundError, UnauthorizedError } from "../../http/errors.ts";
import type { Signup } from "./auth.schemas.ts";
import { DUMMY_HASH, type PasswordHasher } from "./passwords.ts";
import type { RefreshTokensRepository } from "./refresh-tokens.repository.ts";
import { hashRefreshToken, newRefreshToken, type TokenService } from "./tokens.ts";
import type { User, UsersRepository } from "./users.repository.ts";

export type Session = {
  user: User;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

export type AuthServiceDeps = {
  db: Db;
  users: UsersRepository;
  refreshTokens: RefreshTokensRepository;
  passwords: PasswordHasher;
  tokens: TokenService;
  refreshTokenTtlDays: number;
};

// One message for an unknown email and a wrong password, so the answer never tells an
// attacker which emails have accounts.
const invalidLogin = () => new UnauthorizedError("Invalid email or password");
const invalidRefresh = () => new UnauthorizedError("Invalid refresh token: log in again");

export class AuthService {
  readonly #deps: AuthServiceDeps;

  constructor(deps: AuthServiceDeps) {
    this.#deps = deps;
  }

  /** Creates a customer account and logs it in. A taken email is a 409. */
  async signup(input: Signup): Promise<Session> {
    const { db, users, passwords } = this.#deps;
    const passwordHash = await passwords.hash(input.password);
    const user = await users.create(db, { email: input.email, name: input.name, role: "customer", passwordHash });
    return this.#startSession(user);
  }

  async login(email: string, password: string): Promise<Session> {
    const { db, users, passwords } = this.#deps;
    const user = await users.findByEmail(db, email);
    if (user === null) {
      // Same work as a real check, so the response time does not reveal that the email is unknown.
      await passwords.verify(DUMMY_HASH, password);
      throw invalidLogin();
    }
    const { valid, newHash } = await passwords.verifyAndUpgrade(user, password);
    if (!valid) throw invalidLogin();
    if (newHash !== null) await users.updatePasswordHash(db, user.id, newHash);
    return this.#startSession(user);
  }

  /**
   * Trades a refresh token for a new pair and revokes the old one (rotation). A token that
   * was already rotated coming back means someone kept a copy, so its whole family is revoked
   * and both the thief and the user must log in again.
   */
  async refresh(refreshToken: string): Promise<Session> {
    const { db, users, refreshTokens } = this.#deps;
    const at = now();
    const outcome = await withTx(db, async (tx) => {
      const current = await refreshTokens.findByHashForUpdate(tx, hashRefreshToken(refreshToken));
      if (current === null) return { kind: "unknown" } as const;
      if (current.revokedAt !== null) {
        // Returned, not thrown: the revocation must commit, and throwing would roll it back.
        await refreshTokens.revokeFamily(tx, current.familyId, at);
        return { kind: "reused" } as const;
      }
      if (current.expiresAt <= at) return { kind: "expired" } as const;
      const user = await users.findById(tx, current.userId);
      if (user === null) return { kind: "unknown" } as const;

      const next = newRefreshToken();
      // The family keeps its first expiry: 30 days after login, however often it rotates.
      const created = await refreshTokens.create(tx, {
        userId: user.id,
        tokenHash: hashRefreshToken(next),
        familyId: current.familyId,
        expiresAt: current.expiresAt,
      });
      await refreshTokens.markRotated(tx, current.id, { revokedAt: at, replacedById: created.id });
      return { kind: "rotated", user, refreshToken: next, expiresAt: current.expiresAt } as const;
    });

    if (outcome.kind !== "rotated") throw invalidRefresh();
    return this.#issue(outcome.user, outcome.refreshToken, outcome.expiresAt);
  }

  /** Ends the login the refresh token belongs to. Unknown tokens are ignored: logging out twice is fine. */
  async logout(refreshToken: string): Promise<void> {
    const { db, refreshTokens } = this.#deps;
    const current = await refreshTokens.findByHash(db, hashRefreshToken(refreshToken));
    if (current !== null) await refreshTokens.revokeFamily(db, current.familyId, now());
  }

  async me(userId: number): Promise<User> {
    const user = await this.#deps.users.findById(this.#deps.db, userId);
    if (user === null) throw new NotFoundError(`No user with id ${userId}`);
    return user;
  }

  async #startSession(user: User): Promise<Session> {
    const { db, refreshTokens, refreshTokenTtlDays } = this.#deps;
    const refreshToken = newRefreshToken();
    const expiresAt = new Date(now().getTime() + refreshTokenTtlDays * 86_400_000);
    await refreshTokens.create(db, {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      familyId: randomUUID(),
      expiresAt,
    });
    return this.#issue(user, refreshToken, expiresAt);
  }

  async #issue(user: User, refreshToken: string, refreshTokenExpiresAt: Date): Promise<Session> {
    const access = await this.#deps.tokens.issueAccessToken({ id: user.id, role: user.role });
    return { user, accessToken: access.token, accessTokenExpiresAt: access.expiresAt, refreshToken, refreshTokenExpiresAt };
  }
}
