// A collection to experiment with. Run it in the terminal:
//   mongosh "$MONGODB_URI" scratch.mongo.js
// It starts by dropping the collection, so running it again starts over.
db.gigs.drop();

db.gigs.insertMany([
  { artist: "The Late Trio", city: "Austin", startsAt: new Date("2026-10-16T01:00:00Z"), priceCents: 2500, tags: ["live", "small room"] },
  { artist: "Riverside Brass", city: "Denver", startsAt: new Date("2026-10-24T03:00:00Z"), priceCents: 3000, tags: ["live"] },
  { artist: "Synth Collective", city: "Chicago", startsAt: new Date("2026-11-14T02:00:00Z"), priceCents: 2000, tags: ["dance"] },
  { artist: "Folk at Dawn", city: "Austin", startsAt: new Date("2026-11-21T01:00:00Z"), priceCents: 1800, tags: ["acoustic", "live"] },
]);

db.gigs.createIndex({ city: 1, startsAt: 1 });

printjson(
  db.gigs
    .aggregate([
      { $group: { _id: "$city", gigs: { $sum: 1 }, cheapestCents: { $min: "$priceCents" } } },
      { $sort: { _id: 1 } },
    ])
    .toArray(),
);
