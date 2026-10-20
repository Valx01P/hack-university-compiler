// The color theme and density settings. Both are saved in localStorage, so they survive reloads,
// and applied as data-theme and data-density on <html>, which tokens.css reads. index.html applies
// the saved values before the first paint, and useApplyTheme keeps them current afterwards.
import { useEffect } from "react";
import { storageKeys } from "@/lib/storage";
import { useLocalStorage } from "./use-local-storage";
import { useMediaQuery } from "./use-media-query";

export type ThemeSetting = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";

export function useTheme() {
  const [setting, setSetting] = useLocalStorage<ThemeSetting>(storageKeys.theme, "system");
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolved: "light" | "dark" = setting === "system" ? (systemDark ? "dark" : "light") : setting;
  return { setting, resolved, setSetting };
}

export function useDensity() {
  return useLocalStorage<Density>(storageKeys.density, "comfortable");
}

/** Mirrors the settings onto <html>. Rendered once, near the root (see app/providers.tsx). */
export function useApplyTheme(): void {
  const { resolved } = useTheme();
  const [density] = useDensity();

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.density = density;
  }, [resolved, density]);
}
