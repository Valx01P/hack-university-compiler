// Runs before every test file (vite.config.ts names it). It adds jest-dom's matchers, starts the
// fake network (MSW, which fails any request no handler expects), resets the fake API and the
// browser storage after each test, fails any test that logs a console.error (that is how React
// reports bugs such as missing keys), and fills three gaps in jsdom: matchMedia, <dialog>, and
// window.scrollTo. The clock is fixed by vite.config.ts, which runs tests at 2026-10-01T09:00:00Z.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { resetMockApi } from "./handlers";
import { server } from "./server";

// ---------------------------------------------------------------- the fake network

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

// ---------------------------------------------------------------- console.error fails the test

const realConsoleError = console.error;
let loggedErrors: string[] = [];

beforeEach(() => {
  loggedErrors = [];
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "));
    realConsoleError(...args);
  };
});

afterEach(() => {
  cleanup();
  console.error = realConsoleError;
  server.resetHandlers();
  resetMockApi();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.density;
  if (loggedErrors.length > 0) throw new Error(`The test logged console.error:\n${loggedErrors.join("\n")}`);
});

// ---------------------------------------------------------------- jsdom gaps

/** Tests run at a desktop width: (min-width: X) matches up to 1280 px, and the system theme is light. */
const VIEWPORT_WIDTH = 1280;
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList => {
    const minWidth = /\(min-width:\s*([\d.]+)(px|rem|em)\)/.exec(query);
    const matches = minWidth ? VIEWPORT_WIDTH >= Number(minWidth[1]) * (minWidth[2] === "px" ? 1 : 16) : false;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  },
});

// React Router's <ScrollRestoration> scrolls on navigation, which jsdom doesn't implement.
window.scrollTo = () => {};

// jsdom has the <dialog> element but none of its methods. These follow the HTML spec closely
// enough for tests: showModal() opens and focuses the first focusable element, close() fires
// "close" and returns focus to where it was, and Escape fires a cancelable "cancel", then closes.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  const openers = new WeakMap<HTMLDialogElement, Element | null>();
  const FOCUSABLE = "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    if (this.open) return;
    openers.set(this, document.activeElement);
    this.open = true;
    this.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (!this.open) return;
    this.open = false;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event("close"));
    const opener = openers.get(this);
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  };
  document.addEventListener("keydown", (event) => {
    const dialog = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1);
    if (event.key !== "Escape" || !dialog) return;
    if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
  });
}
