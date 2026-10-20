// The auth feature: safe redirects after login, the middleware that sends anonymous visitors to
// /login with ?next=, logging in and out. renderApp runs the real routes and middleware against
// the fake API, as the user given in `as` (null: nobody is logged in).
import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { renderApp } from "@/test/render";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  test.each([
    ["/projects/2", "/projects/2"],
    ["/projects/2?tab=list", "/projects/2?tab=list"],
    ["//evil.example", "/projects"],
    ["https://evil.example", "/projects"],
    ["/\\evil.example", "/projects"],
    ["/\t/evil.example", "/projects"],
    ["/login", "/projects"],
    ["", "/projects"],
    [null, "/projects"],
  ])("%j goes to %s", (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });
});

test("an anonymous visit goes to the login page and remembers where it was going", async () => {
  const { router } = renderApp("/projects/1", { as: null });
  expect(await screen.findByRole("heading", { name: "Log in to Taskboard" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/login");
  expect(router.state.location.search).toBe("?next=%2Fprojects%2F1");
});

test("logging in goes to the page in ?next=", async () => {
  const { user, router } = renderApp("/login?next=%2Fprojects%2F2", { as: null });
  await user.type(await screen.findByLabelText("Email"), "grace@example.com");
  await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(await screen.findByRole("heading", { name: "Mobile App" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/projects/2");
});

test("an unsafe ?next= lands on the projects page instead", async () => {
  const { user, router } = renderApp("/login?next=%2F%2Fevil.example", { as: null });
  await user.type(await screen.findByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/projects");
});

test("a wrong password shows an error and keeps the email", async () => {
  const { user } = renderApp("/login", { as: null });
  await user.type(await screen.findByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "wrong horse battery staple");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
  expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
});

test("logging out returns to the login page", async () => {
  const { user, router } = renderApp("/projects");
  await user.click(await screen.findByRole("button", { name: "Account: Ada Lovelace" }));
  await user.click(screen.getByRole("menuitem", { name: "Log out" }));

  expect(await screen.findByRole("heading", { name: "Log in to Taskboard" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/login");
});
