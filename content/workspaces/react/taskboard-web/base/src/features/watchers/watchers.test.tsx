// Watchers, the small finished feature the capstone copies: the list, an optimistic toggle, and
// a rollback when the server refuses.
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { mockDb } from "@/test/handlers";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const watcherNames = () => within(screen.getByRole("list", { name: "Watchers" })).getAllByRole("listitem").map((li) => li.textContent);

test("Watch adds you at once, and the server keeps it", async () => {
  const { user } = renderApp("/tasks/3", { as: "grace" });
  await waitFor(() => expect(watcherNames()).toEqual(["Ada Lovelace"]));
  await user.click(screen.getByRole("button", { name: "Watch", pressed: false }));

  expect(screen.getByRole("button", { name: "Watching", pressed: true })).toBeInTheDocument();
  expect(watcherNames()).toEqual(["Ada Lovelace", "Grace Hopper"]);
  await waitFor(() => expect(mockDb().watchers).toContainEqual({ task_id: 3, user_id: 2 }));
});

test("a refused change rolls back with a toast", async () => {
  server.use(http.put("/v1/tasks/:taskId/watchers/:userId", () => HttpResponse.json({ type: "about:blank", title: "Internal Server Error", status: 500 }, { status: 500 })));
  const { user } = renderApp("/tasks/3", { as: "grace" });
  await waitFor(() => expect(watcherNames()).toEqual(["Ada Lovelace"]));
  await user.click(screen.getByRole("button", { name: "Watch" }));

  expect(await screen.findByText("Couldn't change who watches this task")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Watch", pressed: false })).toBeInTheDocument();
  expect(watcherNames()).toEqual(["Ada Lovelace"]);
});
