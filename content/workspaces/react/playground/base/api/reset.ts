// npm run api:reset: puts the items back the way api/seed.json has them.
import { resetStore } from "./store.ts";

resetStore();
console.log("Restored api/data/db.json from api/seed.json.");
