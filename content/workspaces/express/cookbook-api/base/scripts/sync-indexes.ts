// Builds each model's indexes to match its schema and reports what changed. syncIndexes()
// creates missing indexes and drops indexes the schema no longer declares, which is how a real
// deploy brings the database in line with the code (production leaves autoIndex off).
import { connect, disconnect } from "../src/db/mongoose.ts";
import { loadConfig } from "../src/config.ts";
import { CollectionModel } from "../src/models/collection.model.ts";
import { RecipeModel } from "../src/models/recipe.model.ts";
import { ReviewModel } from "../src/models/review.model.ts";
import { UserModel } from "../src/models/user.model.ts";

const models = [UserModel, RecipeModel, ReviewModel, CollectionModel];

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  await connect(config.MONGODB_URI);
  for (const model of models) {
    const dropped = await model.syncIndexes();
    process.stdout.write(`${model.modelName}: indexes in sync${dropped.length > 0 ? ` (dropped ${dropped.join(", ")})` : ""}\n`);
  }
  await disconnect();
}

await main();
