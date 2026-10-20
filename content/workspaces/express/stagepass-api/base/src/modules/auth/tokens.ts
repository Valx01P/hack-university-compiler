// Tokens. An access token is a short-lived JWT (HS256): it proves who is calling without a
// database lookup, and it cannot be revoked, which is why it lasts 15 minutes. A refresh
// token is a long random string that buys a new pair. Only its SHA-256 is stored, and it
// rotates on every use.
import { createHash, randomBytes } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { now as clockNow } from "../../clock.ts";
import { roles } from "../../db/schema.ts";
import type { AuthUser } from "../../http/auth.ts";
import { UnauthorizedError } from "../../http/errors.ts";

export type TokenSettings = { secret: string; issuer: string; audience: string; accessTokenTtlSeconds: number };

const AccessClaims = z.object({
  sub: z.string().regex(/^[1-9]\d*$/),
  role: z.enum(roles),
});

export class TokenService {
  readonly #key: Uint8Array;
  readonly #settings: TokenSettings;
  readonly #now: () => Date;

  constructor(settings: TokenSettings, now: () => Date = clockNow) {
    this.#key = new TextEncoder().encode(settings.secret);
    this.#settings = settings;
    this.#now = now;
  }

  async issueAccessToken(user: AuthUser): Promise<{ token: string; expiresAt: Date }> {
    const issuedAt = Math.floor(this.#now().getTime() / 1000);
    const expiresAt = issuedAt + this.#settings.accessTokenTtlSeconds;
    const token = await new SignJWT({ role: user.role })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(String(user.id))
      .setIssuer(this.#settings.issuer)
      .setAudience(this.#settings.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.#key);
    return { token, expiresAt: new Date(expiresAt * 1000) };
  }

  /** The caller behind a token, or a 401 that says why (expired, or invalid in any other way). */
  async verifyAccessToken(token: string): Promise<AuthUser> {
    try {
      const { payload } = await jwtVerify(token, this.#key, {
        algorithms: ["HS256"],
        issuer: this.#settings.issuer,
        audience: this.#settings.audience,
        currentDate: this.#now(),
      });
      const claims = AccessClaims.parse(payload);
      return { id: Number(claims.sub), role: claims.role };
    } catch (err) {
      if (err instanceof errors.JWTExpired) {
        throw new UnauthorizedError("The access token expired: refresh it", { invalidToken: true });
      }
      throw new UnauthorizedError("The access token is not valid", { invalidToken: true });
    }
  }
}

/** 32 random bytes, base64url: unguessable, and safe in JSON and headers. */
export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
