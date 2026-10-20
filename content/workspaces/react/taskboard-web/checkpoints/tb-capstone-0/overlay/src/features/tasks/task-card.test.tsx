// TaskCard on its own, the way a user meets it: the title link, the due label at the fixed clock,
// the priority tag, the avatar's initials fallback, and the status menu from the keyboard.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { fixtures, taskById } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { TaskCard } from "./components/TaskCard";
import type { Task } from "./types";

const grace = { user_id: 2, name: "Grace Hopper", email: "grace@example.com", role: "member" as const };

function renderCard(taskId: number, { canDelete = false } = {}) {
  const task: Task = taskById(taskId);
  const assignee = task.assignee_id === 2 ? grace : undefined;
  return renderWithProviders(<TaskCard task={task} assignee={assignee} canDelete={canDelete} />);
}

test("the title links to the task", () => {
  renderCard(2);
  expect(screen.getByRole("link", { name: "Write release notes" })).toHaveAttribute("href", "/tasks/2");
});

test("an overdue task says by how much, at the fixed clock", () => {
  renderCard(2);
  expect(screen.getByText("Overdue by 2 days")).toHaveAttribute("datetime", "2026-09-29");
});

test("a done task shows its date without urgency", () => {
  renderCard(6);
  expect(screen.getByText("Due Sep 26")).toBeInTheDocument();
});

test("the priority shows as a tag with its tone", () => {
  renderCard(1);
  const tag = screen.getByRole("button", { name: "Priority: High" }).querySelector("[data-ui='tag']");
  expect(tag).toHaveTextContent("High");
  expect(tag?.className).toMatch(/danger/);
});

test("the assignee's avatar falls back to initials when the photo fails", () => {
  renderCard(5);
  fireEvent.error(screen.getByRole("img", { name: "Grace Hopper" }));
  expect(screen.getByRole("img", { name: "Grace Hopper" })).toHaveTextContent("GH");
});

test("an unassigned task says so", () => {
  renderCard(4);
  expect(screen.getByText("Unassigned")).toBeInTheDocument();
});

test("the status menu works from the keyboard and sends the transition", async () => {
  const sent: unknown[] = [];
  server.use(
    http.post("/v1/tasks/:taskId/transition", async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json({ ...fixtures.tasks[6], status: "doing", version: 2 });
    }),
  );
  const { user } = renderCard(7);
  screen.getByRole("button", { name: "Status: To do" }).focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("menuitemradio", { name: "To do" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("menuitemradio", { name: "Doing" })).toHaveFocus();
  await user.keyboard("{Enter}");

  await waitFor(() => expect(sent).toEqual([{ to: "doing" }]));
  expect(screen.getByRole("button", { name: "Status: To do" })).toHaveFocus();
});

test("Escape closes the menu and returns focus to its button", async () => {
  const { user } = renderCard(7);
  await user.click(screen.getByRole("button", { name: "Status: To do" }));
  expect(screen.getByRole("menu")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Status: To do" })).toHaveFocus();
});

test("Rename opens the title editor, and Escape closes it", async () => {
  const { user } = renderCard(7);
  await user.click(screen.getByRole("button", { name: "Rename Update the privacy policy" }));
  expect(screen.getByRole("textbox", { name: "Task title" })).toHaveValue("Update the privacy policy");
  await user.keyboard("{Escape}");
  expect(screen.getByRole("link", { name: "Update the privacy policy" })).toBeInTheDocument();
});
