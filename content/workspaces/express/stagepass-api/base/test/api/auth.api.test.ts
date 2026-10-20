// Logging in, signing up, refreshing, and logging out, through HTTP.
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { PasswordHasher } from "../../src/modules/auth/passwords.ts";
import { DEMO_PASSWORD } from "../../scripts/seed-data.ts";
import { makeTestApp } from "../support/fakes.ts";
import { signTestToken } from "../support/tokens.ts";

const login = (app: ReturnType<typeof makeTestApp>["app"], email: string, password = DEMO_PASSWORD) =>
  request(app).post("/v1/auth/login").send({ email, password });

describe("POST /v1/auth/login", () => {
  it("returns a session: a 15 minute access token, a refresh token, and the user", async () => {
    const { app } = makeTestApp();
    const response = await login(app, "cam@stagepass.test").expect(200);
    expect(response.body).toMatchObject({
      tokenType: "Bearer",
      expiresIn: 900,
      refreshTokenExpiresAt: "2026-10-31T09:00:00.000Z",
      user: { id: 4, email: "cam@stagepass.test", role: "customer" },
    });
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it("answers an unknown email and a wrong password with byte-identical bodies", async () => {
    const { app } = makeTestApp();
    const unknown = await login(app, "nobody@stagepass.test").expect(401);
    const wrong = await login(app, "cam@stagepass.test", "wrong password").expect(401);
    expect(unknown.text).toBe(wrong.text);
  });

  it("checks a password exactly once even when the email is unknown, so timing reveals nothing", async () => {
    const verify = vi.spyOn(PasswordHasher.prototype, "verify");
    const { app } = makeTestApp();
    await login(app, "nobody@stagepass.test").expect(401);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("upgrades the legacy bcrypt hash to argon2id at login", async () => {
    const { app, fakes } = makeTestApp();
    await login(app, "legacy@stagepass.test").expect(200);
    expect(fakes.store.users.find((user) => user.id === 6)?.passwordHash.startsWith("$argon2id$")).toBe(true);
    await login(app, "legacy@stagepass.test").expect(200);
  });

  it("allows 5 attempts per address and email in 15 minutes, then answers 429", async () => {
    const { app } = makeTestApp();
    for (let attempt = 1; attempt <= 5; attempt += 1) await login(app, "dee@stagepass.test", "guess").expect(401);
    const limited = await login(app, "dee@stagepass.test", "guess").expect(429);
    // Both limiters answer in the header (the general one and the login one), as a list.
    expect(limited.headers["ratelimit-policy"]).toMatch(/"5-in-15min"; q=5; w=900/);
    // Another email from the same address is not blocked.
    await login(app, "cam@stagepass.test").expect(200);
  });
});

describe("POST /v1/auth/signup", () => {
  it("creates a customer with a lowercase email and logs them in", async () => {
    const { app } = makeTestApp();
    const response = await request(app)
      .post("/v1/auth/signup")
      .send({ email: " New.Fan@Example.TEST ", name: "New Fan", password: "a long enough passphrase" })
      .expect(201);
    expect(response.body.user).toMatchObject({ id: 7, email: "new.fan@example.test", role: "customer" });
    await login(app, "new.fan@example.test", "a long enough passphrase").expect(200);
  });

  it("refuses a taken email (409) and a short password (400)", async () => {
    const { app } = makeTestApp();
    await request(app).post("/v1/auth/signup").send({ email: "cam@stagepass.test", name: "Cam", password: "a long enough passphrase" }).expect(409);
    const short = await request(app).post("/v1/auth/signup").send({ email: "x@stagepass.test", name: "X", password: "short" }).expect(400);
    expect(short.body.errors).toEqual([{ field: "password", message: "Use at least 12 characters" }]);
  });
});

describe("refresh tokens", () => {
  it("rotate: each refresh token works once, and reusing one revokes the whole login", async () => {
    const { app } = makeTestApp();
    const first = (await login(app, "cam@stagepass.test").expect(200)).body.refreshToken;
    const second = (await request(app).post("/v1/auth/refresh").send({ refreshToken: first }).expect(200)).body.refreshToken;
    expect(second).not.toBe(first);

    await request(app).post("/v1/auth/refresh").send({ refreshToken: first }).expect(401);
    await request(app).post("/v1/auth/refresh").send({ refreshToken: second }).expect(401);
  });

  it("leave other logins alone when one is revoked", async () => {
    const { app } = makeTestApp();
    const phone = (await login(app, "cam@stagepass.test").expect(200)).body.refreshToken;
    const laptop = (await login(app, "cam@stagepass.test").expect(200)).body.refreshToken;
    await request(app).post("/v1/auth/logout").send({ refreshToken: phone }).expect(204);
    await request(app).post("/v1/auth/refresh").send({ refreshToken: phone }).expect(401);
    await request(app).post("/v1/auth/refresh").send({ refreshToken: laptop }).expect(200);
  });

  it("expire 30 days after login, however often they rotate", async () => {
    const { app } = makeTestApp();
    const token = (await login(app, "cam@stagepass.test").expect(200)).body.refreshToken;
    vi.setSystemTime(new Date("2026-10-31T09:00:01Z"));
    await request(app).post("/v1/auth/refresh").send({ refreshToken: token }).expect(401);
  });
});

describe("GET /v1/me", () => {
  it("answers 401 with WWW-Authenticate without a token, and with invalid_token for a bad one", async () => {
    const { app } = makeTestApp();
    const missing = await request(app).get("/v1/me").expect(401);
    expect(missing.headers["www-authenticate"]).toBe("Bearer");

    const malformed = await request(app).get("/v1/me").set("Authorization", "Token abc").expect(401);
    expect(malformed.headers["www-authenticate"]).toMatch(/^Bearer error="invalid_token"/);

    const forged = await signTestToken({ id: 1, role: "admin" }, { secret: "not-the-secret-0123456789abcdef0123" });
    await request(app).get("/v1/me").set("Authorization", `Bearer ${forged}`).expect(401);
  });

  it("refuses an expired token", async () => {
    const { app } = makeTestApp();
    const token = await signTestToken({ id: 4, role: "customer" });
    vi.setSystemTime(new Date("2026-10-01T09:15:01Z"));
    const response = await request(app).get("/v1/me").set("Authorization", `Bearer ${token}`).expect(401);
    expect(response.body.detail).toBe("The access token expired: refresh it");
  });

  it("returns the user for a valid token, never cached", async () => {
    const { app } = makeTestApp();
    const response = await request(app).get("/v1/me").set("Authorization", `Bearer ${await signTestToken({ id: 4, role: "customer" })}`).expect(200);
    expect(response.body).toEqual({ id: 4, email: "cam@stagepass.test", name: "Cam Lee", role: "customer", createdAt: "2026-08-04T12:00:00.000Z" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
