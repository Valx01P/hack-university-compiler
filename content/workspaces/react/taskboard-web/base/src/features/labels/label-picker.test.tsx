// Labels: chips from each task's labels, the picker that toggles them optimistically (one request
// per toggle, rolled back on failure), its keyboard behavior, and a backend without the labels
// tier, which hides every label control without showing an error.
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { mockDb } from "@/test/handlers";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const chips = () => within(screen.getByRole("list", { name: "Labels" })).getAllByRole("listitem").map((li) => li.textContent);

test("a task shows its labels as chips", async () => {
  renderApp("/tasks/1");
  await screen.findByRole("heading", { level: 1, name: "Fix login redirect" });
  expect(chips()).toEqual(["bug", "design"]);
});

test("checking a label adds it at once and saves it", async () => {
  const { user } = renderApp("/tasks/1");
  await user.click(await screen.findByRole("button", { name: "Labels" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: "backend" }));

  expect(chips()).toEqual(["backend", "bug", "design"]);
  await waitFor(() => expect(mockDb().taskLabels).toContainEqual({ task_id: 1, label_id: 3 }));
});

test("Space toggles the focused label, and Escape closes and returns focus", async () => {
  const { user } = renderApp("/tasks/1");
  const trigger = await screen.findByRole("button", { name: "Labels" });
  await user.click(trigger);
  const backend = within(screen.getByRole("dialog")).getByRole("checkbox", { name: "backend" });
  backend.focus();
  await user.keyboard(" ");
  expect(backend).toBeChecked();

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  await waitFor(() => expect(mockDb().taskLabels).toContainEqual({ task_id: 1, label_id: 3 }));
});

test("a failed toggle rolls back with a toast", async () => {
  server.use(http.delete("/v1/tasks/:taskId/labels/:labelId", () => HttpResponse.json({ type: "about:blank", title: "Internal Server Error", status: 500 }, { status: 500 })));
  const { user } = renderApp("/tasks/1");
  await user.click(await screen.findByRole("button", { name: "Labels" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: "bug" }));

  expect(await screen.findByText("Couldn't change the labels")).toBeInTheDocument();
  expect(chips()).toEqual(["bug", "design"]);
});

test("the label filter shows only tasks with that label", async () => {
  const { user, router } = renderApp("/projects/1");
  await user.click(await screen.findByRole("button", { name: "docs", pressed: false }));
  expect(router.state.location.search).toBe("?label=docs");
  await waitFor(() => expect(screen.getAllByRole("article").map((card) => within(card).getByRole("link").textContent)).toEqual(["Write release notes", "Update the privacy policy"]));
});

test("a backend without labels hides the label controls, without an error", async () => {
  server.use(http.get("/v1/projects/:projectId/labels", () => HttpResponse.json({ type: "about:blank", title: "Not Found", status: 404 }, { status: 404 })));
  renderApp("/projects/1");
  await screen.findByRole("heading", { name: /^To do/ });
  expect(screen.queryByRole("group", { name: "Label" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
