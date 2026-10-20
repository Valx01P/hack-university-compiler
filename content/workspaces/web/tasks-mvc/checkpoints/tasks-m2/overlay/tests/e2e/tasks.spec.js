// End-to-end tests: Chromium uses the app through the page, the way a person
// does. Each test gets a fresh browser context, so localStorage starts empty.
import { test as base, expect } from "@playwright/test";

// Every test also fails if the page throws an error it did not handle.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors, "errors the page threw").toEqual([]);
  },
});

const SEED_TITLES = ["Read the README", "Add your first task", "Try the Active filter"];

const titles = (page) => page.locator("#task-list .task-title");
const newTask = (page) => page.getByRole("textbox", { name: "New task" });
const count = (page) => page.getByRole("status");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows the sample tasks on a first visit", async ({ page }) => {
  await expect(titles(page)).toHaveText(SEED_TITLES);
  await expect(page.getByRole("checkbox", { name: "Read the README" })).toBeChecked();
  await expect(count(page)).toHaveText("2 items left");
});

test("adds a task from the form", async ({ page }) => {
  await newTask(page).fill("  Water the plants  ");
  await newTask(page).press("Enter");

  await expect(titles(page)).toHaveText([...SEED_TITLES, "Water the plants"]);
  await expect(newTask(page)).toHaveValue("");
  await expect(newTask(page)).toBeFocused();
  await expect(count(page)).toHaveText("3 items left");
});

test("ignores a blank title", async ({ page }) => {
  await newTask(page).fill("   ");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(titles(page)).toHaveText(SEED_TITLES);
});
