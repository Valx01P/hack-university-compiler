// The login journey in a real browser: an anonymous visit goes to the login page, logging in as Ada
// shows her 2 projects with an HttpOnly session cookie, and logging out lands on /login again.
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/_hu/reset");
});

test("log in as Ada, see her 2 projects, log out", async ({ page, context }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects$/);

  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(2);
  const session = (await context.cookies()).find((cookie) => cookie.name === "tb_session");
  expect(session?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("tb_session");

  await page.getByRole("button", { name: "Account: Ada Lovelace" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Log in to Taskboard" })).toBeVisible();
});
