// The entry point. It loads the global styles, registers what happens when a session expires,
// and renders the providers around the router inside <StrictMode>, which in development renders
// twice and runs effects twice to surface impure code and missing cleanups. The root's error
// options log errors that error boundaries caught and the ones they didn't.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { AppProviders } from "@/app/providers";
import { queryClient } from "@/app/query-client";
import { router } from "@/app/router";
import { redirectOnExpiredSession } from "@/features/auth";
import "@/styles/tokens.css";
import "@/styles/global.css";

redirectOnExpiredSession(queryClient, (to) => router.navigate(to));

createRoot(document.getElementById("root")!, {
  onCaughtError: (error, info) => console.warn("An error boundary caught:", error, info.componentStack),
  onUncaughtError: (error, info) => console.error("Uncaught error:", error, info.componentStack),
}).render(
  <StrictMode>
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
