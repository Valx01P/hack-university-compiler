// Where "now" comes from. Commands get a Clock instead of calling new Date() themselves,
// so tests and transcripts can freeze time: HU_FIXED_TIME turns on fixedClock (config.ts).
export type Clock = { readonly now: () => Date };

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) throw new RangeError(`Not a valid time: ${iso}`);
  // A new Date on every call, so nobody can move the clock by changing the one they got.
  return { now: () => new Date(at) };
}
