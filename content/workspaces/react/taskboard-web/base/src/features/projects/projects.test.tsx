// The projects feature: the projects page, creating and renaming a project with the server's
// errors under the field, prefetching on hover, and the project routes (tabs, stats, 404).
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { mockDb } from "@/test/handlers";
import { renderApp, renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { ProjectsPage } from "./ProjectsPage";

/** Records "GET /v1/projects/2/tasks" for every request the fake network sees. */
function recordRequests(): string[] {
  const seen: string[] = [];
  server.events.on("request:start", ({ request }) => {
    seen.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return seen;
}

test("lists your projects with their task counts", async () => {
  renderWithProviders(<ProjectsPage />, { route: "/projects" });

  const cards = await screen.findAllByRole("article");
  expect(cards.map((card) => within(card).getByRole("heading").textContent)).toEqual(["Website Relaunch", "Mobile App"]);
  const counts = within(cards[0]!).getAllByRole("definition").map((dd) => dd.textContent);
  expect(counts).toEqual(["3", "3", "2"]);
});

test("someone in no project sees the empty state", async () => {
  renderWithProviders(<ProjectsPage />, { as: "margaret" });
  expect(await screen.findByRole("heading", { name: "You're not in any projects yet" })).toBeInTheDocument();
});

test("a failed load offers Retry", async () => {
  server.use(http.get("/v1/projects", () => HttpResponse.json({ type: "about:blank", title: "Internal Server Error", status: 500 }, { status: 500 }), { once: true }));
  const { user } = renderWithProviders(<ProjectsPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your projects");
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { name: "Website Relaunch" })).toBeInTheDocument();
});

test("a name you already use shows the 409 under Name, keeps it, and focuses it", async () => {
  const { user } = renderWithProviders(<ProjectsPage />);
  await user.click(await screen.findByRole("button", { name: "New project" }));
  const dialog = screen.getByRole("dialog", { name: "New project" });
  await user.type(within(dialog).getByLabelText("Name"), "website relaunch");
  await user.click(within(dialog).getByRole("button", { name: "Create project" }));

  expect(await within(dialog).findByText("A project with this name already exists")).toBeInTheDocument();
  const name = within(dialog).getByLabelText("Name");
  expect(name).toHaveValue("website relaunch");
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(name).toHaveFocus();
});

test("creating a project closes the dialog and lists it", async () => {
  const { user } = renderWithProviders(<ProjectsPage />);
  await user.click(await screen.findByRole("button", { name: "New project" }));
  await user.type(screen.getByLabelText("Name"), "Launch Plan");
  await user.selectOptions(screen.getByLabelText("Color"), "Orange");
  await user.click(screen.getByRole("button", { name: "Create project" }));

  expect(await screen.findByRole("heading", { name: "Launch Plan" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mockDb().projects.at(-1)).toMatchObject({ name: "Launch Plan", color: "#f97316", owner_id: 1 });
});

test("hovering or focusing a project prefetches its board, once within staleTime", async () => {
  const requests = recordRequests();
  const { user } = renderWithProviders(<ProjectsPage />);
  const card = (await screen.findByRole("heading", { name: "Mobile App" })).closest("article")!;

  await user.hover(card);
  await waitFor(() => expect(requests).toContain("GET /v1/projects/2/tasks"));
  await user.unhover(card);
  await user.hover(card);
  await user.tab();
  expect(requests.filter((r) => r === "GET /v1/projects/2/tasks")).toHaveLength(1);
});

test("the owner renames a project without refetching it", async () => {
  const requests = recordRequests();
  const { user } = renderApp("/projects/1");
  await user.click(await screen.findByRole("button", { name: "Rename" }));
  const field = screen.getByRole("textbox", { name: "Project name" });
  await user.clear(field);
  await user.type(field, "Website 2026");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("heading", { level: 1, name: "Website 2026" })).toBeInTheDocument();
  await waitFor(() => expect(requests.filter((r) => r === "GET /v1/projects")).toHaveLength(2));
  expect(requests.filter((r) => r === "GET /v1/projects/1")).toHaveLength(1);
});

test("a name that is too short shows the API's message under the field", async () => {
  const { user } = renderApp("/projects/1");
  await user.click(await screen.findByRole("button", { name: "Rename" }));
  const field = screen.getByRole("textbox", { name: "Project name" });
  await user.clear(field);
  await user.type(field, "ab");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("The name must be 3 to 100 characters")).toBeInTheDocument();
  expect(field).toHaveValue("ab");
});

test("members don't see Rename", async () => {
  renderApp("/projects/1", { as: "grace" });
  expect(await screen.findByRole("heading", { level: 1, name: "Website Relaunch" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
});

test("the Members tab lists the members and is the current tab", async () => {
  renderApp("/projects/1/members");
  expect(await screen.findByText("Ada Lovelace", { selector: "p" })).toBeInTheDocument();
  expect(screen.getByText("Grace Hopper", { selector: "p" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
});

test("the Stats tab shows the counts by status", async () => {
  renderApp("/projects/1/stats");
  const panel = await screen.findByRole("region", { name: "Task counts" });
  await waitFor(() => expect(panel).toHaveAttribute("aria-busy", "false"));
  expect(within(panel).getByText("To do").nextSibling).toHaveTextContent("3");
  expect(within(panel).getByText("Doing").nextSibling).toHaveTextContent("3");
  expect(within(panel).getByText("Done").nextSibling).toHaveTextContent("2");
});

test("a project that doesn't exist shows Project not found, with a way back", async () => {
  renderApp("/projects/999");
  expect(await screen.findByRole("heading", { name: "Project not found" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to projects" })).toHaveAttribute("href", "/projects");
});
