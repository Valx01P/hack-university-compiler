// A smoke test: the quickest check that the page loads and its script ran.
// Copy it to start your own tests.
import { expect, test } from "@playwright/test";

test("the page loads and #app has text", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");

  await expect(page).toHaveTitle("Web playground");
  await expect(page.locator("#app")).toContainText("Hello, web!");
  expect(errors).toEqual([]);
});
