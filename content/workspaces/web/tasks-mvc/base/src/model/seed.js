// The tasks a first-time visitor sees. main.js uses them only when nothing is
// saved under tasks:v1 yet, or when what is saved there cannot be read.

export const SEED_TASKS = Object.freeze([
  { id: "seed-1", title: "Read the README", done: true },
  { id: "seed-2", title: "Add your first task", done: false },
  { id: "seed-3", title: "Try the Active filter", done: false },
]);
