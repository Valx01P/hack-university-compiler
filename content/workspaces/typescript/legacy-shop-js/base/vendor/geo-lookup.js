/*!
 * geo-lookup 2.3.1
 * US zip codes to their state and city. This bundled build only carries the zips below.
 * (c) 2017 geo-lookup contributors. MIT License.
 */
"use strict";

var ZIPS = {
  "94103": ["CA", "San Francisco"],
  "10001": ["NY", "New York"],
  "73301": ["TX", "Austin"],
  "98101": ["WA", "Seattle"],
  "97201": ["OR", "Portland"],
  "99501": ["AK", "Anchorage"],
  "60601": ["IL", "Chicago"],
};

class GeoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GeoError";
    this.code = code;
  }
}

function isValidZip(zip) {
  return typeof zip === "string" && /^[0-9]{5}$/.test(zip);
}

function lookupZip(zip) {
  if (!isValidZip(zip)) throw new GeoError("BAD_ZIP", "Not a 5-digit zip: " + zip);
  if (!ZIPS) throw new GeoError("NO_DATA", "The zip data did not load");
  var hit = ZIPS[zip];
  return hit ? { state: hit[0], city: hit[1] } : null;
}

module.exports = {
  lookupZip: lookupZip,
  isValidZip: isValidZip,
  version: "2.3.1",
  GeoError: GeoError,
};
