import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, clearDb, connectTestDb, dropTestDb } from "../support/mongo.ts";

let app: Express;

const recipeBody = {
  title: "Weeknight Pasta",
  ingredients: [{ name: "pasta", quantity: 200, unit: "g" }],
  steps: ["Boil.", "Toss."],
  cuisine: "italian",
  difficulty: "easy",
  prepMinutes: 20,
};

beforeAll(async () => {
  await connectTestDb("recipes_api");
  app = buildTestApp();
});
afterAll(() => dropTestDb());
beforeEach(() => clearDb());

async function authedAgent(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/signup").send({ name: "Chef", email, password: "cook-with-node-26" });
  return agent;
}

describe("Recipes API", () => {
  it("creates, lists, and reads a recipe", async () => {
    const agent = await authedAgent("chef@cookbook.test");
    const created = await agent.post("/api/recipes").send(recipeBody);
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe("weeknight-pasta");
    expect(created.headers.location).toBe("/api/recipes/weeknight-pasta");

    const list = await request(app).get("/api/recipes");
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);

    const one = await request(app).get("/api/recipes/weeknight-pasta");
    expect(one.status).toBe(200);
    expect(one.body.title).toBe("Weeknight Pasta");
  });

  it("lets only the author edit, and validates the patch", async () => {
    const author = await authedAgent("author@cookbook.test");
    await author.post("/api/recipes").send(recipeBody);

    const stranger = await authedAgent("stranger@cookbook.test");
    expect((await stranger.patch("/api/recipes/weeknight-pasta").send({ difficulty: "medium" })).status).toBe(403);

    const bad = await author.patch("/api/recipes/weeknight-pasta").send({ difficulty: "impossible" });
    expect(bad.status).toBe(400);
    expect(bad.body.fields.difficulty).toBeDefined();
  });

  it("soft-deletes so the recipe is gone from reads", async () => {
    const author = await authedAgent("author@cookbook.test");
    await author.post("/api/recipes").send(recipeBody);
    expect((await author.delete("/api/recipes/weeknight-pasta")).status).toBe(204);
    expect((await request(app).get("/api/recipes/weeknight-pasta")).status).toBe(404);
  });

  it("refuses to create without a session", async () => {
    expect((await request(app).post("/api/recipes").send(recipeBody)).status).toBe(401);
  });
});
