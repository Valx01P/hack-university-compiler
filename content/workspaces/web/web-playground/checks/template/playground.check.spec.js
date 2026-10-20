// The web-playground template's own regression checks: the starter page loads
// cleanly, its files are served with the right types, the <picture> picks AVIF,
// and the page is accessible and fits a phone. It never enters the workspace.
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect } from "@playwright/test";

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await use(page);
    expect(errors, "errors the page threw or logged").toEqual([]);
  },
});

test("renders the greeting from the module script", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Web playground");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hello, web!");
});

test("the picture downloads only the AVIF", async ({ page }) => {
  const images = [];
  page.on("response", (response) => {
    if (response.url().includes("/images/")) images.push(new URL(response.url()).pathname);
  });
  await page.goto("/");
  const img = page.getByRole("img", { name: /sunset/ });
  await expect(img).toHaveJSProperty("complete", true);
  expect(await img.evaluate((element) => element.currentSrc)).toMatch(/\/images\/sample-800\.avif$/);
  expect(await img.evaluate((element) => element.naturalWidth)).toBe(800);
  expect(images).toEqual(["/images/sample-800.avif"]);
});

test("serves public/ at the root with the right types", async ({ request }) => {
  const types = {
    "/favicon.svg": "image/svg+xml",
    "/images/sample-800.jpg": "image/jpeg",
    "/images/sample-800.webp": "image/webp",
    "/images/sample-800.avif": "image/avif",
  };
  for (const [path, type] of Object.entries(types)) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain(type);
  }
});

test("axe finds no WCAG 2.1 A or AA violations, in light and dark", async ({ page }) => {
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, colorScheme).toEqual([]);
  }
});

test("fits a 375 pixel wide phone without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
