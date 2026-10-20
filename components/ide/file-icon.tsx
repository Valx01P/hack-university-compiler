import "@/.generated/file-icons.css";
import { fileIconClass, folderIconClass } from "@/lib/file-icons";

/**
 * A file's or folder's Material icon (material-icon-theme, picked and
 * trimmed at build time by scripts/build-content.mjs). The icons are CSS
 * data: URIs, so they're there at first paint with no image requests, and a
 * light page theme gets the light variants without waiting for script.
 */
export function FileIcon({ name, folder = false, open = false, className = "" }: { name: string; folder?: boolean; open?: boolean; className?: string }) {
  return <span aria-hidden className={`${folder ? folderIconClass(name, open) : fileIconClass(name)} ${className}`} />;
}
