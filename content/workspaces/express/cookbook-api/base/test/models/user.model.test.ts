import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UserModel } from "../../src/models/user.model.ts";
import { clearDb, connectTestDb, dropTestDb } from "../support/mongo.ts";

beforeAll(() => connectTestDb("user_model"));
afterAll(() => dropTestDb());
beforeEach(() => clearDb());

describe("User password hook", () => {
  it("hashes the password on create and verifies it", async () => {
    const user = await UserModel.create({ email: "Ana@Example.com", name: "Ana", password: "supersecret" });
    const stored = await UserModel.findById(user._id).select("+password");
    expect(stored!.password.startsWith("$argon2")).toBe(true);
    expect(await stored!.verifyPassword("supersecret")).toBe(true);
    expect(await stored!.verifyPassword("wrong")).toBe(false);
  });

  it("lowercases and trims the email", async () => {
    const user = await UserModel.create({ email: "  Ana@Example.com ", name: "Ana", password: "supersecret" });
    expect(user.email).toBe("ana@example.com");
  });

  it("does not re-hash when only the name changes", async () => {
    const user = await UserModel.create({ email: "ben@example.com", name: "Ben", password: "supersecret" });
    const before = (await UserModel.findById(user._id).select("+password"))!.password;

    user.name = "Benjamin";
    await user.save();
    const after = (await UserModel.findById(user._id).select("+password"))!.password;
    expect(after).toBe(before);
  });

  it("re-hashes when the password changes", async () => {
    const user = await UserModel.create({ email: "cy@example.com", name: "Cy", password: "supersecret" });
    const before = (await UserModel.findById(user._id).select("+password"))!.password;

    const loaded = (await UserModel.findById(user._id).select("+password"))!;
    loaded.password = "a-new-password";
    await loaded.save();
    const after = (await UserModel.findById(user._id).select("+password"))!.password;
    expect(after).not.toBe(before);
    expect(await loaded.verifyPassword("a-new-password")).toBe(true);
  });

  it("keeps the password and reset fields out of JSON", async () => {
    const user = await UserModel.create({ email: "dee@example.com", name: "Dee", password: "supersecret" });
    const json = user.toJSON() as unknown as Record<string, unknown>;
    expect(json.password).toBeUndefined();
    expect(json.resetTokenHash).toBeUndefined();
    expect(json.id).toBe(String(user._id));
    expect(json._id).toBeUndefined();
  });
});
