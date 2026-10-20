// One test, to show how testing works here: render the component, act like a user with
// user-event, and assert what the screen shows. npm test re-runs it every time you save.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import App from "./App";

test("counts clicks", async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole("heading", { name: "Edit src/App.tsx" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Clicked 0 times" }));
  expect(screen.getByRole("button", { name: "Clicked 1 time" })).toBeInTheDocument();
});
