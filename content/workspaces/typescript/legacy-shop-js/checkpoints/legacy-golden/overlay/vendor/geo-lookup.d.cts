// Types for the vendored geo-lookup 2.3.1, a CommonJS file that ships none. A .d.cts describes
// a .cjs file: each export here is a property of its module.exports. lookupZip really does
// return null for a zip it has no data for, so the type says so.
export type StateCode = "CA" | "NY" | "TX" | "WA" | "OR" | "AK" | "IL";

export declare function lookupZip(zip: string): { state: StateCode; city: string } | null;

export declare function isValidZip(zip: string): boolean;

export declare const version: string;

export declare class GeoError extends Error {
  constructor(code: "BAD_ZIP" | "NO_DATA", message: string);
  readonly code: "BAD_ZIP" | "NO_DATA";
}
