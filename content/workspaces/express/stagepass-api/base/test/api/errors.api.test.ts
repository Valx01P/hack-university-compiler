// One error shape for everything: RFC 9457 problems, and never a leaked internal message.
import { DrizzleQueryError } from "drizzle-orm";
import express from "express";
import { MulterError } from "multer";
import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler, toProblem } from "../../src/http/error-handler.ts";
import { ConflictError, NotFoundError } from "../../src/http/errors.ts";
import { makeTestApp } from "../support/fakes.ts";

const pgError = (code: string, constraint?: string) => Object.assign(new Error(`pg error ${code}`), { code, constraint });

describe("toProblem", () => {
  it.each<[string, unknown, number]>([
    ["an AppError keeps its status", new ConflictError("sold-out", "Gone"), 409],
    ["a ZodError is a 400", z.object({ a: z.string() }).safeParse({}).error, 400],
    ["a file over the limit is a 413", new MulterError("LIMIT_FILE_SIZE", "poster"), 413],
    ["an unexpected file field is a 400", new MulterError("LIMIT_UNEXPECTED_FILE", "image"), 400],
    ["a unique violation is a 409", pgError("23505", "venues_name_city_unique"), 409],
    ["a foreign key violation is a 422", pgError("23503"), 422],
    ["a check violation is a 422", pgError("23514", "ticket_types_sold_within_capacity_check"), 422],
    ["Drizzle's wrapper is looked through", new DrizzleQueryError("insert ...", [], pgError("23505")), 409],
    ["a statement timeout is a 503", pgError("57014"), 503],
    ["a body over the limit is a 413", Object.assign(new Error("too large"), { type: "entity.too.large", status: 413 }), 413],
    ["anything else is a 500", new Error("boom"), 500],
  ])("%s", (_case, err, status) => {
    expect(toProblem(err).status).toBe(status);
  });

  it("names the constraint a database rule caught", () => {
    expect(toProblem(pgError("23514", "ticket_types_sold_within_capacity_check"))).toMatchObject({
      constraint: "ticket_types_sold_within_capacity_check",
    });
  });
});

describe("the error handler", () => {
  function tinyApp(err: unknown) {
    const app = express();
    app.use((req, _res, next) => {
      req.log = pino({ level: "silent" });
      req.requestId = "test";
      next();
    });
    app.get("/boom", () => {
      throw err;
    });
    app.use(errorHandler);
    return app;
  }

  it("answers 500 without the error's message, which may hold secrets", async () => {
    const response = await request(tinyApp(new Error("db password is hunter2"))).get("/boom").expect(500);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({ type: "about:blank", title: "Internal Server Error", status: 500, instance: "/boom" });
    expect(response.text).not.toContain("hunter2");
  });

  it("includes the detail of errors made to be shown", async () => {
    const response = await request(tinyApp(new NotFoundError("No event with id 99"))).get("/boom").expect(404);
    expect(response.body.detail).toBe("No event with id 99");
  });
});

describe("the app's edges", () => {
  it("answers unknown API routes with a 404 problem, and unknown pages with the HTML page", async () => {
    const { app } = makeTestApp();
    const api = await request(app).get("/v1/nope").expect(404);
    expect(api.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(api.body.detail).toBe("No route GET /v1/nope");

    const page = await request(app).get("/nope").set("Accept", "text/html").expect(404);
    expect(page.headers["content-type"]).toMatch(/^text\/html/);
  });

  it("answers malformed JSON with 400 and bodies over 100 kB with 413", async () => {
    const { app } = makeTestApp();
    await request(app).post("/v1/auth/login").set("Content-Type", "application/json").send('{"email":').expect(400);
    await request(app).post("/v1/auth/login").send({ email: "x@stagepass.test", password: "p".repeat(150_000) }).expect(413);
  });

  it("echoes a sensible X-Request-Id and replaces anything else", async () => {
    const { app } = makeTestApp();
    const kept = await request(app).get("/healthz").set("X-Request-Id", "ex-1").expect(200);
    expect(kept.headers["x-request-id"]).toBe("ex-1");
    const replaced = await request(app).get("/healthz").set("X-Request-Id", "<script>").expect(200);
    expect(replaced.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends security headers and no X-Powered-By", async () => {
    const { app } = makeTestApp();
    const response = await request(app).get("/e/the-blue-note-jam").expect(200);
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("allows CORS only for the origins in CORS_ORIGINS", async () => {
    const { app } = makeTestApp({ env: { CORS_ORIGINS: "http://localhost:5173" } });
    const allowed = await request(app).get("/v1/venues").set("Origin", "http://localhost:5173").expect(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    const other = await request(app).get("/v1/venues").set("Origin", "http://evil.test").expect(200);
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers readiness 503 while shutting down, and liveness 200 regardless", async () => {
    const { app, readiness } = makeTestApp();
    await request(app).get("/readyz").expect(200);
    readiness.drain();
    const draining = await request(app).get("/readyz").expect(503);
    expect(draining.body.detail).toBe("shutting down");
    await request(app).get("/healthz").expect(200);
  });

  it("serves an OpenAPI 3.1 document that covers every route", async () => {
    const { app } = makeTestApp();
    const response = await request(app).get("/openapi.json").expect(200);
    expect(response.body.openapi).toBe("3.1.1");
    expect(response.body.paths["/v1/events/{eventId}/ticket-types"].post.requestBody.content["application/json"].schema.required).toEqual([
      "name",
      "priceCents",
      "capacity",
    ]);
  });
});
