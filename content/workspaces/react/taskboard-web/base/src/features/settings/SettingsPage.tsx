// /settings: the color theme and the density, saved in this browser's localStorage and applied
// at once. This route's code is loaded only when someone opens it (a lazy route in
// app/routes.tsx), so it builds into its own chunk. Admins also see the link to the danger zone.
import { Link } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { useDensity, useTheme, type Density, type ThemeSetting } from "@/hooks/use-theme";
import styles from "./Settings.module.css";

const THEMES: Array<{ value: ThemeSetting; label: string }> = [
  { value: "system", label: "Match my system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const DENSITIES: Array<{ value: Density; label: string }> = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

export function SettingsPage() {
  const user = useCurrentUser();
  const { setting, setSetting } = useTheme();
  const [density, setDensity] = useDensity();

  return (
    <section className={styles.page} aria-labelledby="settings-heading">
      <title>Settings · Taskboard</title>
      <h1 id="settings-heading">Settings</h1>

      <fieldset className={styles.group}>
        <legend>Theme</legend>
        {THEMES.map((theme) => (
          <label key={theme.value} className={styles.choice}>
            <input type="radio" name="theme" value={theme.value} checked={setting === theme.value} onChange={() => setSetting(theme.value)} />
            {theme.label}
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Density</legend>
        {DENSITIES.map((option) => (
          <label key={option.value} className={styles.choice}>
            <input type="radio" name="density" value={option.value} checked={density === option.value} onChange={() => setDensity(option.value)} />
            {option.label}
          </label>
        ))}
      </fieldset>

      <p className={styles.note}>These settings are saved in this browser only.</p>

      {user.role === "admin" && (
        <p>
          <Link to="/settings/danger">Danger zone</Link>
        </p>
      )}
    </section>
  );
}
