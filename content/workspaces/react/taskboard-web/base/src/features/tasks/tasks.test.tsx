// The tasks feature through the real routes: the board and its filters, optimistic status and
// priority changes and their rollbacks, quick add and delete through route actions, the list's
// sort and pages, the task page, and editing with the 412 conflict.
import { renderHook, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { fixtures } from "@/test/fixtures";
import { mockDb } from "@/test/handlers";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { useDueSummary } from "./hooks/use-due-summary";

const failWith500 = () => HttpResponse.json({ type: "about:blank", title: "Internal Server Error", status: 500 }, { status: 500 });

/** The titles of the cards in one board column. */
function column(name: string): string[] {
  const section = screen.getByRole("region", { name: new RegExp(`^${name}`) });
  return within(section)
    .queryAllByRole("article")
    .map((card) => within(card).getByRole("link").textContent!);
}

test("useDueSummary counts every seed task at the fixed clock", () => {
  const { result } = renderHook(() => useDueSummary(fixtures.tasks));
  expect(result.current).toEqual({ overdue: 3, today: 1, upcoming: 4 });
});

test("the board shows each task in its status's column", async () => {
  renderApp("/projects/1");
  await screen.findByRole("heading", { name: /^To do/ });
  expect(column("To do")).toEqual(["Write release notes", "Audit color contrast", "Update the privacy policy"]);
  expect(column("Doing")).toEqual(["Design the pricing page", "Fix login redirect", "Migrate images to WebP"]);
  expect(column("Done")).toEqual(["Set up analytics", "Add a sitemap"]);
});

test("the due summary and the board's heading agree", async () => {
  renderApp("/projects/1");
  const due = await screen.findByLabelText("Due dates");
  expect(within(due).getAllByRole("definition").map((dd) => dd.textContent)).toEqual(["2", "1", "1"]);
  expect(screen.getByText("2 overdue")).toBeInTheDocument();
});

test("a status filter in the URL shows only those tasks", async () => {
  renderApp("/projects/1?status=todo");
  await screen.findByRole("heading", { name: /^To do/ });
  expect(column("To do")).toHaveLength(3);
  expect(column("Doing")).toEqual([]);
  expect(screen.getByRole("button", { name: "To do", pressed: true })).toBeInTheDocument();
});

test("clicking a status chip writes it to the URL", async () => {
  const { user, router } = renderApp("/projects/1");
  await user.click(await screen.findByRole("button", { name: "Done", pressed: false }));
  expect(router.state.location.search).toBe("?status=done");
  await waitFor(() => expect(column("To do")).toEqual([]));
});

test("moving a task with the status menu moves the card at once and saves it", async () => {
  const { user } = renderApp("/projects/1");
  const card = (await screen.findByRole("link", { name: "Update the privacy policy" })).closest("article")!;
  await user.click(within(card).getByRole("button", { name: "Status: To do" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Doing" }));

  expect(column("Doing")).toContain("Update the privacy policy");
  await waitFor(() => expect(mockDb().tasks.find((t) => t.id === 7)).toMatchObject({ status: "doing", version: 2 }));
});

test("a failed move puts the card back and says so", async () => {
  server.use(http.post("/v1/tasks/:taskId/transition", failWith500));
  const { user } = renderApp("/projects/1");
  const card = (await screen.findByRole("link", { name: "Update the privacy policy" })).closest("article")!;
  await user.click(within(card).getByRole("button", { name: "Status: To do" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Done" }));

  expect(await screen.findByText("Couldn't move the task. It's back where it was.")).toBeInTheDocument();
  expect(column("To do")).toContain("Update the privacy policy");
});

test("done can't go straight back to to do", async () => {
  const { user } = renderApp("/projects/1");
  const card = (await screen.findByRole("link", { name: "Add a sitemap" })).closest("article")!;
  await user.click(within(card).getByRole("button", { name: "Status: Done" }));
  expect(screen.getByRole("menuitemradio", { name: "To do" })).toBeDisabled();
  expect(screen.getByRole("menuitemradio", { name: "Doing" })).toBeEnabled();
});

test("a failed priority change rolls back with a toast", async () => {
  server.use(http.patch("/v1/tasks/:taskId", failWith500));
  const { user } = renderApp("/projects/1");
  const card = (await screen.findByRole("link", { name: "Write release notes" })).closest("article")!;
  await user.click(within(card).getByRole("button", { name: "Priority: Medium" }));
  await user.click(screen.getByRole("menuitemradio", { name: "High" }));

  expect(await screen.findByText("Couldn't change the priority")).toBeInTheDocument();
  expect(within(card).getByRole("button", { name: "Priority: Medium" })).toBeInTheDocument();
});

test("quick add creates a task in To do, and shows the server's error for an empty title", async () => {
  const { user } = renderApp("/projects/1");
  const field = await screen.findByLabelText("Quick add");
  await user.click(screen.getByRole("button", { name: "Add" }));
  expect(await screen.findByText("Title is required")).toBeInTheDocument();

  await user.type(field, "Write the launch email");
  await user.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(column("To do")).toContain("Write the launch email"));
  expect(screen.getByLabelText("Quick add")).toHaveValue("");
});

test("the owner deletes a task through the fetcher", async () => {
  const { user } = renderApp("/projects/1");
  await user.click(await screen.findByRole("button", { name: "Delete Add a sitemap" }));
  await waitFor(() => expect(column("Done")).toEqual(["Set up analytics"]));
  expect(mockDb().tasks.some((t) => t.id === 8)).toBe(false);
});

test("members get no Delete buttons", async () => {
  renderApp("/projects/1", { as: "grace" });
  await screen.findByRole("heading", { name: /^To do/ });
  expect(screen.queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
});

test("the list sorts as ?sort= says", async () => {
  renderApp("/projects/1/list?sort=priority");
  const rows = await screen.findAllByRole("row");
  const titles = rows.slice(1).map((row) => within(row).getAllByRole("cell")[0]!.textContent);
  expect(titles).toEqual(["Fix login redirect", "Design the pricing page", "Write release notes", "Audit color contrast", "Update the privacy policy", "Migrate images to WebP", "Set up analytics", "Add a sitemap"]);
});

test("Sort by writes ?sort=, and the default leaves the URL", async () => {
  const { user, router } = renderApp("/projects/1/list");
  await user.selectOptions(await screen.findByLabelText("Sort by"), "title");
  expect(router.state.location.search).toBe("?sort=title");
  await user.selectOptions(screen.getByLabelText("Sort by"), "due");
  expect(router.state.location.search).toBe("");
});

test("the task page shows the task, its assignee, and a way back", async () => {
  renderApp("/tasks/1");
  expect(await screen.findByRole("heading", { level: 1, name: "Fix login redirect" })).toBeInTheDocument();
  await waitFor(() => expect(document.title).toBe("Fix login redirect · Taskboard"));
  expect(await screen.findByText("Grace Hopper", { selector: "span" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to board" })).toHaveAttribute("href", "/projects/1");
});

test("an unassigned task says so, without asking for /v1/projects/undefined", async () => {
  const paths: string[] = [];
  server.events.on("request:start", ({ request }) => paths.push(new URL(request.url).pathname));
  renderApp("/tasks/4");
  expect(await screen.findByText("Unassigned")).toBeInTheDocument();
  expect(paths.some((path) => path.includes("undefined"))).toBe(false);
});

test("a task that doesn't exist shows Task not found", async () => {
  renderApp("/tasks/999");
  expect(await screen.findByRole("heading", { name: "Task not found" })).toBeInTheDocument();
});

test("saving over someone else's change shows the conflict, and Load latest fetches their version", async () => {
  const { user } = renderApp("/tasks/3/edit");
  const title = await screen.findByLabelText("Title");
  Object.assign(mockDb().tasks.find((t) => t.id === 3)!, { title: "Design the pricing page v2", version: 2 });

  await user.clear(title);
  await user.type(title, "Pricing page");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Someone else changed this task");

  await user.click(screen.getByRole("button", { name: "Load latest" }));
  await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Design the pricing page v2"));
});

test("saving an edit goes back to the task with the new title", async () => {
  const { user, router } = renderApp("/tasks/3/edit");
  const title = await screen.findByLabelText("Title");
  await user.clear(title);
  await user.type(title, "Design the pricing page and FAQ");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("heading", { level: 1, name: "Design the pricing page and FAQ" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/tasks/3");
});
