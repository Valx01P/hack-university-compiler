// Comments: pages of 10 with Load more, a new comment shown as "Sending..." until the server has
// it (useOptimistic), and a failed post that puts the text back with an error.
import { screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const comments = () => within(screen.getByRole("region", { name: "Comments" })).getAllByRole("listitem");

test("loads comments 10 at a time, oldest first", async () => {
  const { user } = renderApp("/tasks/1");
  expect(await screen.findByText("I can reproduce it: open /projects/2 signed out, sign in, and you land on /.")).toBeInTheDocument();
  expect(comments()).toHaveLength(10);

  await user.click(screen.getByRole("button", { name: "Load more comments" }));
  await waitFor(() => expect(comments()).toHaveLength(20));
  await user.click(screen.getByRole("button", { name: "Load more comments" }));
  await waitFor(() => expect(comments()).toHaveLength(23));
  expect(screen.queryByRole("button", { name: "Load more comments" })).not.toBeInTheDocument();
  expect(comments().at(-1)).toHaveTextContent("Merged.");
});

test("a new comment shows as Sending... until the server has it", async () => {
  server.use(
    http.post("/v1/tasks/:taskId/comments", async ({ request }) => {
      await delay(100);
      const { body } = (await request.json()) as { body: string };
      return HttpResponse.json({ id: 32, task_id: 3, author: { id: 1, name: "Ada Lovelace" }, body, created_at: "2026-10-01T09:00:00Z" }, { status: 201 });
    }),
  );
  const { user } = renderApp("/tasks/3");
  await screen.findByText("First draft of the three plans is in Figma.");
  await user.type(screen.getByLabelText("Add a comment"), "Looks good to me.");
  await user.click(screen.getByRole("button", { name: "Post comment" }));

  const pending = await screen.findByText(/Sending\.\.\./);
  expect(pending.closest("li")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Posting..." })).toBeDisabled();
  await waitFor(() => expect(screen.queryByText(/Sending\.\.\./)).not.toBeInTheDocument());
});

test("a failed post rolls back and keeps the text", async () => {
  server.use(http.post("/v1/tasks/:taskId/comments", () => HttpResponse.json({ type: "about:blank", title: "Internal Server Error", status: 500 }, { status: 500 })));
  const { user } = renderApp("/tasks/3");
  await screen.findByText("First draft of the three plans is in Figma.");
  await user.type(screen.getByLabelText("Add a comment"), "This will fail #fail");
  await user.click(screen.getByRole("button", { name: "Post comment" }));

  expect(await screen.findByText("Couldn't post your comment. Try again.")).toBeInTheDocument();
  expect(screen.getByLabelText("Add a comment")).toHaveValue("This will fail #fail");
  expect(screen.queryByText(/Sending\.\.\./)).not.toBeInTheDocument();
  expect(comments()).toHaveLength(2);
});

test("a comment's text is shown as text, never as HTML", async () => {
  server.use(
    http.get("/v1/tasks/:taskId/comments", () =>
      HttpResponse.json({ items: [{ id: 99, task_id: 3, author: { id: 2, name: "Grace Hopper" }, body: "<img src=x onerror=alert(1)>", created_at: "2026-09-20T10:00:00Z" }], next_cursor: null }),
    ),
  );
  renderApp("/tasks/3");
  expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  expect(document.querySelector("img[src='x']")).toBeNull();
});

test("the author and the project's owner may delete a comment, others may not", async () => {
  const { user } = renderApp("/tasks/3", { as: "grace" });
  await screen.findByText("First draft of the three plans is in Figma.");
  expect(screen.getByRole("button", { name: "Delete comment by Grace Hopper" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Delete comment by Ada Lovelace" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Delete comment by Grace Hopper" }));
  await waitFor(() => expect(comments()).toHaveLength(1));
});
