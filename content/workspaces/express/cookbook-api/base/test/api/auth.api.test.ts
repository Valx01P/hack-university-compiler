import type { Express } from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, clearDb, connectTestDb, dropTestDb } from "../support/mongo.ts";

let app: Express;

beforeAll(async () => {
  await connectTestDb("auth_api");
  app = buildTestApp();
});
afterAll(() => dropTestDb());
beforeEach(() => clearDb());

async function signup(name: string, email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/signup").send({ name, email, password: "cook-with-node-26" });
  return { agent, res };
}

describe("Auth API", () => {
  it("signs up, returns the user, and keeps a session", async () => {
    const { agent, res } = await signup("Ada", "ada@cookbook.test");
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("ada@cookbook.test");
    expect(res.body.password).toBeUndefined();

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("ada@cookbook.test");
  });

  it("gives the same 401 for an unknown email and a wrong password", async () => {
    await signup("Ada", "ada@cookbook.test");
    const unknown = await request(app).post("/api/auth/login").send({ email: "nobody@cookbook.test", password: "cook-with-node-26" });
    const wrong = await request(app).post("/api/auth/login").send({ email: "ada@cookbook.test", password: "not-the-password" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("logs out and then refuses /me", async () => {
    const { agent } = await signup("Ada", "ada@cookbook.test");
    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("resets a password through the reset token in the outbox", async () => {
    await signup("Ada", "ada@cookbook.test");
    expect((await request(app).post("/api/auth/forgot-password").send({ email: "ada@cookbook.test" })).status).toBe(202);

    const mail = await mongoose.connection.collection("mail_outbox").findOne({ to: "ada@cookbook.test" });
    const token = new URL(`http://x${mail!.link as string}`).searchParams.get("token")!;

    expect((await request(app).post("/api/auth/reset-password").send({ token, newPassword: "a-brand-new-pass" })).status).toBe(200);
    expect((await request(app).post("/api/auth/login").send({ email: "ada@cookbook.test", password: "a-brand-new-pass" })).status).toBe(200);
  });
});
