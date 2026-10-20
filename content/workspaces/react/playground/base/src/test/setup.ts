// Runs before every test file: adds jest-dom's matchers (toBeInTheDocument, toHaveValue, and the
// rest) and unmounts whatever a test rendered once it ends. To fake the network in a test, start
// an MSW server here (see the README).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
