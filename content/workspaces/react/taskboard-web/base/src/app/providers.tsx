// Everything the app needs around it: the query cache, toasts, and the theme. main.tsx wraps the
// router in these, and tests wrap what they render in the same providers (src/test/render.tsx),
// so components behave in tests exactly as they do in the app.
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { useApplyTheme } from "@/hooks/use-theme";

export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </ToastProvider>
      {/* Development only: the production build leaves the devtools out entirely. */}
      {import.meta.env.MODE === "development" && <ReactQueryDevtools buttonPosition="bottom-left" />}
    </QueryClientProvider>
  );
}

function ThemeProvider({ children }: { children: ReactNode }) {
  useApplyTheme();
  return children;
}
