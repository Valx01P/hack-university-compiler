// The task journey in a real browser: create a task in Website Relaunch, move it to Done, reload,
// and it is still in Done, because the move reached the API. Logging in goes through the API
// directly: the page's request context shares the browser's cookies, so the page is logged in too.
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("/_hu/reset");
  await page.request.post("/v1/auth/login", { data: { email: "ada@example.com", password: "correct horse battery staple" } });
});

const column = (page: Page, name: string) => page.getByRole("region", { name: new RegExp(`^${name}`) });

test("create a task, move it to Done, reload, and it is still Done", async ({ page }) => {
  await page.goto("/projects/1");
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill("Write the e2e test");
  await dialog.getByRole("button", { name: "Create task" }).click();

  const card = column(page, "To do").getByRole("article").filter({ has: page.getByRole("link", { name: "Write the e2e test" }) });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Status: To do" }).click();
  await page.getByRole("menuitemradio", { name: "Done" }).click();
  await expect(column(page, "Done").getByRole("link", { name: "Write the e2e test" })).toBeVisible();

  await page.reload();
  await expect(column(page, "Done").getByRole("link", { name: "Write the e2e test" })).toBeVisible();
});

test("dragging a card to another column moves it", async ({ page, isMobile }) => {
  test.skip(isMobile, "HTML drag and drop needs a mouse; phones use the status menu");
  await page.goto("/projects/1");
  const card = column(page, "To do").getByRole("article").filter({ has: page.getByRole("link", { name: "Update the privacy policy" }) });
  await card.dragTo(column(page, "Doing"));
  await expect(column(page, "Doing").getByRole("link", { name: "Update the privacy policy" })).toBeVisible();
  await page.reload();
  await expect(column(page, "Doing").getByRole("link", { name: "Update the privacy policy" })).toBeVisible();
});
