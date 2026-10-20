// Small helpers used around the app.

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isEmpty(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return Object.keys(value).length === 0;
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// Runs fn after HU_RACE_DELAY_MS (0 by default). Tests set it to widen the gap between
// answering a request and finishing its work, so a race shows up every time.
function raceWindow(fn) {
  setTimeout(fn, Number(process.env.HU_RACE_DELAY_MS) || 0);
}

module.exports = { deepClone, isEmpty, sleep, raceWindow };
