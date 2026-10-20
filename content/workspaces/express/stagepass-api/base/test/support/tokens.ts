// Access tokens for tests, signed with the test secret the app uses when NODE_ENV=test, so a
// test can act as any user without logging in (and without argon2's deliberate slowness).
import { TEST_JWT_SECRET } from "../../src/config.ts";
import type { AuthUser } from "../../src/http/auth.ts";
import { TokenService } from "../../src/modules/auth/tokens.ts";

export const testTokenSettings = {
  secret: TEST_JWT_SECRET,
  issuer: "stagepass",
  audience: "stagepass-api",
  accessTokenTtlSeconds: 900,
};

export async function signTestToken(user: AuthUser, settings: Partial<typeof testTokenSettings> = {}): Promise<string> {
  const { token } = await new TokenService({ ...testTokenSettings, ...settings }).issueAccessToken(user);
  return token;
}

/** The demo users by name, as AuthUser values for services and tokens. */
export const as = {
  admin: { id: 1, role: "admin" },
  olu: { id: 2, role: "organizer" },
  priya: { id: 3, role: "organizer" },
  cam: { id: 4, role: "customer" },
  dee: { id: 5, role: "customer" },
} as const satisfies Record<string, AuthUser>;

export async function bearer(user: AuthUser): Promise<string> {
  return `Bearer ${await signTestToken(user)}`;
}
