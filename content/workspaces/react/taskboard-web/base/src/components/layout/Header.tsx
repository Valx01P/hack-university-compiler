// The bar above every signed-in page: the navigation button on small screens, the task search on
// project pages, the theme toggle, and the user menu with Settings and Log out.
import { useNavigate } from "react-router";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronDownIcon, MenuIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/Menu";
import { useCurrentUser, useLogout } from "@/features/auth";
import styles from "./Header.module.css";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";

export function Header({ onOpenNavigation }: { onOpenNavigation?: () => void }) {
  const user = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <header className={styles.header}>
      {onOpenNavigation && (
        <IconButton label="Open navigation" onClick={onOpenNavigation}>
          <MenuIcon />
        </IconButton>
      )}
      <SearchBox />
      <div className={styles.actions}>
        <ThemeToggle />
        <Menu
          align="end"
          label={`Account: ${user.name}`}
          trigger={
            <>
              <Avatar name={user.name} size={24} />
              <span className={styles.userName}>{user.name}</span>
              <ChevronDownIcon />
            </>
          }
          items={[
            { key: "settings", label: "Settings", onSelect: () => void navigate("/settings") },
            { key: "logout", label: "Log out", onSelect: () => void logout() },
          ]}
        />
      </div>
    </header>
  );
}
