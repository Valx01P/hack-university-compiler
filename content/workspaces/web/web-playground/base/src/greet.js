// A module with one named export. Nothing in this file is visible to other files
// unless it is exported, and main.js imports it by name.

/** The greeting main.js shows, such as "Hello, web!". */
export function greet(name) {
  return `Hello, ${name}!`;
}
