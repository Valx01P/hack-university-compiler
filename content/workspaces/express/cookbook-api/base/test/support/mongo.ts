// Test database helpers. Each test file gets its own database, derived from TEST_MONGODB_URI by
// appending a tag, so files never see each other's documents. The database is dropped when the
// file finishes.
import mongoose from "mongoose";
import { connect, disconnect } from "../../src/db/mongoose.ts";
import { CollectionModel } from "../../src/models/collection.model.ts";
import { RecipeModel } from "../../src/models/recipe.model.ts";
import { ReviewModel } from "../../src/models/review.model.ts";
import { UserModel } from "../../src/models/user.model.ts";
import { createApp } from "../../src/app.ts";
import { loadConfig } from "../../src/config.ts";
import { createLogger } from "../../src/logger.ts";

const models = [UserModel, RecipeModel, ReviewModel, CollectionModel];

function testUri(tag: string): string {
  const base = process.env.TEST_MONGODB_URI;
  if (!base) throw new Error("TEST_MONGODB_URI is not set");
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "") || "cookbook_test";
  url.pathname = `/${name}_${tag}`;
  return url.toString();
}

export async function connectTestDb(tag: string): Promise<void> {
  await connect(testUri(tag));
  // Build the indexes the tests rely on (unique email, unique slug, unique recipe+author).
  await Promise.all(models.map((model) => model.syncIndexes()));
}

export async function clearDb(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export async function dropTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await disconnect();
}

// Builds the app wired to the test database for API tests. NODE_ENV is test, so the session
// store and command counter use the open test connection and logging stays quiet.
export function buildTestApp() {
  const config = loadConfig({ ...process.env, MONGODB_URI: process.env.TEST_MONGODB_URI, NODE_ENV: "test" });
  const logger = createLogger({ level: "error", pretty: false });
  return createApp(config, logger);
}
