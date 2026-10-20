// The database connection. connect() opens the single shared Mongoose connection and sets the
// safety options the whole app relies on: strictQuery drops unknown filter keys, and
// sanitizeFilter strips query operators ($gt, $ne, ...) out of values that came from a client,
// so a filter built from a request body cannot smuggle operators into a query.
import mongoose from "mongoose";

export async function connect(uri: string): Promise<typeof mongoose> {
  mongoose.set("strictQuery", true);
  mongoose.set("sanitizeFilter", true);
  // Let the seed and index scripts build indexes; a real production deploy turns this off and
  // builds them with syncIndexes() as part of a release.
  mongoose.set("autoIndex", process.env.NODE_ENV !== "production");
  // monitorCommands lets the command counter see each command the driver sends (X-Db-Commands).
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000, monitorCommands: process.env.NODE_ENV !== "production" });
  return mongoose;
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}
