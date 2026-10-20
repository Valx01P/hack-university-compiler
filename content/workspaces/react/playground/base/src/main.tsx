// The entry point: renders <App /> inside <StrictMode>, which in development renders twice and
// runs effects twice to surface impure code and missing cleanups. Wrap <App /> here in the
// providers you add (a QueryClientProvider, a RouterProvider); the README shows how.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
