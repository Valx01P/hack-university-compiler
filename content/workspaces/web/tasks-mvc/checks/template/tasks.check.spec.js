// The tasks-mvc regression suite: everything the finished app does, checked
// through the page. The template suite runs it, and so does every challenge
// with "regression": true, so a fix that breaks another feature fails Check.
// It never enters the learner's workspace.
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

const SEED = ["Read the README", "Add your first task", "Try the Active filter"];

const titles = (page) => page.locator("#task-list .task-title");
const row = (page, title) => page.locator("#task-list > li").filter({ hasText: title });
const newTask = (page) => page.getByRole("textbox", { name: "New task" });
const count = (page) => page.getByRole("status");
const filterLink = (page, name) =>
  page.getByRole("navigation", { name: "Filter tasks" }).getByRole("link", { name });
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("tasks:v1")));

async function add(page, ...items) {
  for (const title of items) {
    await newTask(page).fill(title);
    await newTask(page).press("Enter");
  }
}

test.describe("a fresh visit", () => {
  test("shows the three sample tasks and saves nothing yet", async ({ page }) => {
    await page.goto("/");
    await expect(titles(page)).toHaveText(SEED);
    await expect(count(page)).toHaveText("2 items left");
    expect(await saved(page)).toBeNull();
  });

  test("saves every change under tasks:v1", async ({ page }) => {
    await page.goto("/");
    await add(page, "Water the plants");
    expect(await saved(page)).toEqual([
      { id: "seed-1", title: "Read the README", done: true },
      { id: "seed-2", title: "Add your first task", done: false },
      { id: "seed-3", title: "Try the Active filter", done: false },
      { id: expect.any(String), title: "Water the plants", done: false },
    ]);
  });
});

test.describe("saved data", () => {
  test("loads saved tasks instead of the samples", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tasks:v1", JSON.stringify([{ id: "x", title: "Saved", done: true }]));
    });
    await page.goto("/");
    await expect(titles(page)).toHaveText(["Saved"]);
    await expect(count(page)).toHaveText("0 items left");
  });

  test("an empty saved list stays empty, and the footer hides", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("tasks:v1", "[]"));
    await page.goto("/");
    await expect(titles(page)).toHaveCount(0);
    await expect(page.locator("#task-footer")).toBeHidden();
  });

  for (const corrupt of ["{not json", '{"tasks":[]}', '[{"id":"x","title":"No done"}]']) {
    test(`unreadable data (${corrupt}) gives the samples without an error`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("tasks:v1", value), corrupt);
      await page.goto("/");
      await expect(titles(page)).toHaveText(SEED);
    });
  }
});

test.describe("editing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("a double-click edits in place, and Enter saves the trimmed title", async ({ page }) => {
    await row(page, "Add your first task").locator(".task-title").dblclick();
    const field = page.getByRole("textbox", { name: "Task title" });
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Add your first task");
    await field.fill("  Add two tasks  ");
    await field.press("Enter");
    await expect(titles(page)).toHaveText(["Read the README", "Add two tasks", SEED[2]]);
    await expect(row(page, "Add two tasks").getByRole("button", { name: "Edit" })).toBeFocused();
  });

  test("Escape cancels the edit", async ({ page }) => {
    await row(page, "Add your first task").getByRole("button", { name: "Edit" }).click();
    const field = page.getByRole("textbox", { name: "Task title" });
    await field.fill("Something else");
    await field.press("Escape");
    await expect(titles(page)).toHaveText(SEED);
    await expect(field).toBeHidden();
  });

  test("clicking away saves the edit", async ({ page }) => {
    await row(page, "Try the Active filter").locator(".task-title").dblclick();
    await page.getByRole("textbox", { name: "Task title" }).fill("Try every filter");
    await page.getByRole("heading", { name: "Tasks" }).click();
    await expect(titles(page)).toHaveText([SEED[0], SEED[1], "Try every filter"]);
  });

  test("clearing the title deletes the task", async ({ page }) => {
    await row(page, "Add your first task").locator(".task-title").dblclick();
    await page.getByRole("textbox", { name: "Task title" }).fill("   ");
    await page.getByRole("textbox", { name: "Task title" }).press("Enter");
    await expect(titles(page)).toHaveText([SEED[0], SEED[2]]);
    await expect(page.getByRole("checkbox", { name: SEED[2] })).toBeFocused();
  });

  test("a click on another task while editing still lands", async ({ page }) => {
    await row(page, "Add your first task").locator(".task-title").dblclick();
    await page.getByRole("textbox", { name: "Task title" }).fill("Add one task");
    await page.getByRole("checkbox", { name: SEED[2] }).click();
    await expect(titles(page)).toHaveText([SEED[0], "Add one task", SEED[2]]);
    await expect(page.getByRole("checkbox", { name: SEED[2] })).toBeChecked();
  });
});

test.describe("deleting", () => {
  test("removes the task and moves focus to the next one", async ({ page }) => {
    await page.goto("/");
    await row(page, "Add your first task").getByRole("button", { name: "Delete" }).click();
    await expect(titles(page)).toHaveText([SEED[0], SEED[2]]);
    await expect(page.getByRole("checkbox", { name: SEED[2] })).toBeFocused();
    await expect(count(page)).toHaveText("1 item left");
  });

  test("deleting the last task moves focus to the new task field", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tasks:v1", JSON.stringify([{ id: "x", title: "Only", done: false }]));
    });
    await page.goto("/");
    await row(page, "Only").getByRole("button", { name: "Delete" }).click();
    await expect(newTask(page)).toBeFocused();
    await expect(page.locator("#task-footer")).toBeHidden();
  });
});

test.describe("the keyboard", () => {
  test("can add, check off, edit, and delete without a mouse", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(newTask(page)).toBeFocused();
    await page.keyboard.type("Water the plants");
    await page.keyboard.press("Enter");
    await expect(titles(page)).toHaveText([...SEED, "Water the plants"]);

    await page.keyboard.press("Tab"); // the Add button
    await page.keyboard.press("Tab"); // the first checkbox
    await expect(page.getByRole("checkbox", { name: SEED[0] })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.getByRole("checkbox", { name: SEED[0] })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: SEED[0] })).toBeFocused();

    await page.keyboard.press("Tab"); // Edit
    await page.keyboard.press("Enter");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Read the whole README");
    await page.keyboard.press("Enter");
    await expect(titles(page).first()).toHaveText("Read the whole README");

    await page.keyboard.press("Tab"); // Delete
    await page.keyboard.press("Enter");
    await expect(titles(page)).toHaveText([SEED[1], SEED[2], "Water the plants"]);
    await expect(page.getByRole("checkbox", { name: SEED[1] })).toBeFocused();
  });
});

test.describe("filters", () => {
  test("Active and Completed show the matching tasks, and the link is current", async ({ page }) => {
    await page.goto("/");
    await expect(filterLink(page, "All")).toHaveAttribute("aria-current", "page");

    await filterLink(page, "Active").click();
    await expect(page).toHaveURL(/\?filter=active$/);
    await expect(titles(page)).toHaveText([SEED[1], SEED[2]]);
    await expect(filterLink(page, "Active")).toHaveAttribute("aria-current", "page");
    await expect(filterLink(page, "All")).not.toHaveAttribute("aria-current");

    await filterLink(page, "Completed").click();
    await expect(page).toHaveURL(/\?filter=completed$/);
    await expect(titles(page)).toHaveText([SEED[0]]);
  });

  test("Back and Forward move between filters without reloading", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      window.notReloaded = true;
    });
    await filterLink(page, "Active").click();
    await filterLink(page, "Completed").click();

    await page.goBack();
    await expect(titles(page)).toHaveText([SEED[1], SEED[2]]);
    await expect(filterLink(page, "Active")).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(titles(page)).toHaveText(SEED);
    await page.goForward();
    await expect(titles(page)).toHaveText([SEED[1], SEED[2]]);
    expect(await page.evaluate(() => window.notReloaded)).toBe(true);
  });

  test("a link with ?filter= opens on that filter", async ({ page }) => {
    await page.goto("/?filter=completed");
    await expect(titles(page)).toHaveText([SEED[0]]);
    await expect(filterLink(page, "Completed")).toHaveAttribute("aria-current", "page");
  });

  test("an unknown filter shows everything", async ({ page }) => {
    await page.goto("/?filter=urgent");
    await expect(titles(page)).toHaveText(SEED);
    await expect(filterLink(page, "All")).toHaveAttribute("aria-current", "page");
  });

  test("checking a task off under Active removes it and keeps focus in the list", async ({ page }) => {
    await page.goto("/?filter=active");
    // click, not check: check() waits to see the box checked, but it leaves the list.
    await page.getByRole("checkbox", { name: SEED[1] }).click();
    await expect(titles(page)).toHaveText([SEED[2]]);
    await expect(page.getByRole("checkbox", { name: SEED[2] })).toBeFocused();
  });
});

test.describe("Clear completed", () => {
  test("removes the done tasks, then hides itself", async ({ page }) => {
    await page.goto("/");
    const clear = page.getByRole("button", { name: "Clear completed" });
    await clear.click();
    await expect(titles(page)).toHaveText([SEED[1], SEED[2]]);
    await expect(clear).toBeHidden();
    await expect(newTask(page)).toBeFocused();
    expect((await saved(page)).map((task) => task.title)).toEqual([SEED[1], SEED[2]]);
  });
});

test.describe("accessibility and layout", () => {
  test("axe finds no WCAG 2.1 A or AA violations", async ({ page }) => {
    await page.goto("/");
    const axe = () => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
    expect((await axe().analyze()).violations).toEqual([]);

    await row(page, "Add your first task").getByRole("button", { name: "Edit" }).click();
    expect((await axe().analyze()).violations).toEqual([]);
  });

  test("fits a 375 pixel wide phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto("/");
    await add(page, "A task with a long title that has to wrap onto a second line on a phone");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
