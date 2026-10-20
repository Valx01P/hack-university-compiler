// The Team page: everyone at first, a debounced search, the empty state, and an error with Retry.
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { UserDirectory } from "./UserDirectory";

test("lists everyone before anyone types", async () => {
  renderWithProviders(<UserDirectory />);
  expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getAllByText(/@example\.com$/)).toHaveLength(4);
});

test("searching narrows the list, once typing pauses", async () => {
  const queries: string[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname === "/v1/users") queries.push(url.searchParams.get("q") ?? "");
  });
  const { user } = renderWithProviders(<UserDirectory />);
  await screen.findByText("Ada Lovelace");
  await user.type(screen.getByLabelText("Search people"), "grace");

  await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
  expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  expect(queries).toEqual(["", "grace"]);
});

test("no match shows the empty state", async () => {
  const { user } = renderWithProviders(<UserDirectory />);
  await screen.findByText("Ada Lovelace");
  await user.type(screen.getByLabelText("Search people"), "nobody");
  expect(await screen.findByRole("heading", { name: "No members match" })).toBeInTheDocument();
});

test("an error offers Retry, which loads again", async () => {
  server.use(http.get("/v1/users", () => HttpResponse.json({ type: "about:blank", title: "Internal Server Error", status: 500 }, { status: 500 }), { once: true }));
  const { user } = renderWithProviders(<UserDirectory />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the team");
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
});
