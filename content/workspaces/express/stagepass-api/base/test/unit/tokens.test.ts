// Access tokens: signed claims anyone can read but nobody can change, for 15 minutes.
import { decodeJwt, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../../src/http/errors.ts";
import { hashRefreshToken, newRefreshToken, TokenService } from "../../src/modules/auth/tokens.ts";
import { testTokenSettings } from "../support/tokens.ts";

const tokens = new TokenService(testTokenSettings);

async function reason(token: string): Promise<string> {
  try {
    await tokens.verifyAccessToken(token);
    return "valid";
  } catch (err) {
    expect(err).toBeInstanceOf(UnauthorizedError);
    return (err as Error).message;
  }
}

describe("TokenService", () => {
  it("issues a token that verifies back to the same user", async () => {
    const { token, expiresAt } = await tokens.issueAccessToken({ id: 4, role: "customer" });
    expect(await tokens.verifyAccessToken(token)).toEqual({ id: 4, role: "customer" });
    expect(expiresAt.toISOString()).toBe("2026-10-01T09:15:00.000Z");
    expect(decodeJwt(token)).toMatchObject({ sub: "4", role: "customer", iss: "stagepass", aud: "stagepass-api" });
  });

  it("issues the same token for the same user at the same moment", async () => {
    const first = await tokens.issueAccessToken({ id: 2, role: "organizer" });
    const second = await tokens.issueAccessToken({ id: 2, role: "organizer" });
    expect(second.token).toBe(first.token);
  });

  it("refuses an expired token, and says so", async () => {
    const { token } = await tokens.issueAccessToken({ id: 4, role: "customer" });
    vi.setSystemTime(new Date("2026-10-01T09:15:01Z"));
    expect(await reason(token)).toBe("The access token expired: refresh it");
  });

  it("refuses a token signed with another secret", async () => {
    const forged = new TokenService({ ...testTokenSettings, secret: "someone-elses-secret-0123456789abcdef" });
    const { token } = await forged.issueAccessToken({ id: 1, role: "admin" });
    expect(await reason(token)).toBe("The access token is not valid");
  });

  it("refuses a token for another audience", async () => {
    const other = new TokenService({ ...testTokenSettings, audience: "another-api" });
    const { token } = await other.issueAccessToken({ id: 4, role: "customer" });
    expect(await reason(token)).toBe("The access token is not valid");
  });

  it("refuses a token whose payload was edited, though decodeJwt would believe it", async () => {
    const { token } = await tokens.issueAccessToken({ id: 4, role: "customer" });
    const [header, payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString());
    const edited = Buffer.from(JSON.stringify({ ...claims, role: "admin" })).toString("base64url");
    const tampered = `${header}.${edited}.${signature}`;

    expect(decodeJwt(tampered).role).toBe("admin");
    expect(await reason(tampered)).toBe("The access token is not valid");
  });

  it("refuses a validly signed token whose claims are not ours", async () => {
    const key = new TextEncoder().encode(testTokenSettings.secret);
    const token = await new SignJWT({ role: "superuser" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("4")
      .setIssuer("stagepass")
      .setAudience("stagepass-api")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(key);
    expect(await reason(token)).toBe("The access token is not valid");
  });
});

describe("refresh tokens", () => {
  it("are long random strings, stored only as a hash", () => {
    const token = newRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newRefreshToken()).not.toBe(token);
    expect(hashRefreshToken(token)).not.toContain(token);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });
});
