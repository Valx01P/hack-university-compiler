// Switches between the light and dark themes. The choice is saved, so it outlives the tab, and
// "Match my system" can be picked again in Settings.
import { IconButton } from "@/components/ui/IconButton";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { resolved, setSetting } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <IconButton label={`Switch to the ${next} theme`} onClick={() => setSetting(next)}>
      {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}
