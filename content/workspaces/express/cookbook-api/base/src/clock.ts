// Where "now" comes from. Timestamps come from the app, not the database, so a frozen clock
// (HU_FIXED_TIME) makes seeds, transcripts, and tests deterministic. Mongoose schemas pass
// now to timestamps: { currentTime: () => now() }.
const fixed = process.env.HU_FIXED_TIME;

export function now(): Date {
  return fixed ? new Date(fixed) : new Date();
}
