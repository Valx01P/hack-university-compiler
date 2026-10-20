// Password hashing: argon2id for new hashes, older hashes upgraded at the next login.
import * as argon2 from "argon2";
import { describe, expect, it } from "vitest";
import { DUMMY_HASH, PasswordHasher } from "../../src/modules/auth/passwords.ts";
import { DEMO_PASSWORD, users } from "../../scripts/seed-data.ts";

const passwords = new PasswordHasher();
const legacyHash = users.find((user) => user.email === "legacy@stagepass.test")?.passwordHash ?? "";

describe("PasswordHasher", () => {
  it("hashes with argon2id and today's settings, and verifies", async () => {
    const hash = await passwords.hash("correct horse battery");
    expect(hash.startsWith("$argon2id$v=19$m=19456,p=1,t=2$")).toBe(true);
    expect(await passwords.verify(hash, "correct horse battery")).toBe(true);
    expect(await passwords.verify(hash, "Correct horse battery")).toBe(false);
  });

  it("salts every hash, so the same password never hashes the same way twice", async () => {
    const [first, second] = await Promise.all([passwords.hash("same password"), passwords.hash("same password")]);
    expect(first).not.toBe(second);
  });

  it("verifies the bcrypt hash imported for the legacy customer", async () => {
    expect(legacyHash.startsWith("$2b$")).toBe(true);
    expect(await passwords.verify(legacyHash, DEMO_PASSWORD)).toBe(true);
    expect(await passwords.verify(legacyHash, "wrong")).toBe(false);
  });

  it("treats a malformed stored hash as a wrong password, not a crash", async () => {
    expect(await passwords.verify("not a hash", "anything")).toBe(false);
  });

  it("the dummy hash is a real argon2id hash that no likely password matches", async () => {
    expect(DUMMY_HASH.startsWith("$argon2id$")).toBe(true);
    expect(await passwords.verify(DUMMY_HASH, DEMO_PASSWORD)).toBe(false);
  });

  it("knows which hashes need upgrading", async () => {
    const weak = await argon2.hash("x", { type: argon2.argon2id, memoryCost: 4_096, timeCost: 3, parallelism: 1 });
    expect(passwords.needsRehash(weak)).toBe(true);
    expect(passwords.needsRehash(legacyHash)).toBe(true);
    expect(passwords.needsRehash(await passwords.hash("x"))).toBe(false);
  });
});

describe("verifyAndUpgrade", () => {
  it("upgrades a bcrypt hash to argon2id after a correct password", async () => {
    const { valid, newHash } = await passwords.verifyAndUpgrade({ passwordHash: legacyHash }, DEMO_PASSWORD);
    expect(valid).toBe(true);
    expect(newHash?.startsWith("$argon2id$")).toBe(true);
    expect(await passwords.verify(newHash ?? "", DEMO_PASSWORD)).toBe(true);
  });

  it("leaves a current hash alone", async () => {
    const current = await passwords.hash(DEMO_PASSWORD);
    expect(await passwords.verifyAndUpgrade({ passwordHash: current }, DEMO_PASSWORD)).toEqual({ valid: true, newHash: null });
  });

  it("never upgrades after a wrong password", async () => {
    expect(await passwords.verifyAndUpgrade({ passwordHash: legacyHash }, "wrong")).toEqual({ valid: false, newHash: null });
  });
});
