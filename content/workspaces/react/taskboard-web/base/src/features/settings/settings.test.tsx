// Settings: the theme and density saved in localStorage and applied to <html>, and the admin-only
// danger zone (a link only admins see, and a route that answers 403 to everyone else).
import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp } from "@/test/render";

test("choosing the dark theme applies it and saves it", async () => {
  const { user } = renderApp("/settings");
  await user.click(await screen.findByRole("radio", { name: "Dark" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("tb:theme:v1")).toBe('"dark"');
});

test("the theme follows the system by default, and the header toggle switches it", async () => {
  const { user } = renderApp("/settings");
  expect(await screen.findByRole("radio", { name: "Match my system" })).toBeChecked();
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  await user.click(screen.getByRole("button", { name: "Switch to the dark theme" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
});

test("compact density is saved and applied", async () => {
  const { user } = renderApp("/settings");
  await user.click(await screen.findByRole("radio", { name: "Compact" }));
  expect(document.documentElement).toHaveAttribute("data-density", "compact");
  expect(localStorage.getItem("tb:density:v1")).toBe('"compact"');
});

test("admins see the danger zone link and page", async () => {
  const { user } = renderApp("/settings");
  await user.click(await screen.findByRole("link", { name: "Danger zone" }));
  expect(await screen.findByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
});

test("members get no link, and the page answers 403", async () => {
  renderApp("/settings", { as: "grace" });
  await screen.findByRole("heading", { name: "Settings" });
  expect(screen.queryByRole("link", { name: "Danger zone" })).not.toBeInTheDocument();
});

test("a member opening the danger zone directly sees the 403 page", async () => {
  renderApp("/settings/danger", { as: "grace" });
  expect(await screen.findByRole("heading", { name: "You don't have access to this page" })).toBeInTheDocument();
});

test("an anonymous visitor goes to login with next", async () => {
  const { router } = renderApp("/settings/danger", { as: null });
  await screen.findByRole("heading", { name: "Log in to Taskboard" });
  expect(router.state.location.search).toBe("?next=%2Fsettings%2Fdanger");
});
