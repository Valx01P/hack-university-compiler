import { ICONS } from "@/.generated/file-icons";

/**
 * The Material icon of a file or folder (material-icon-theme, trimmed to
 * what the workspaces use by scripts/build-content.mjs). Returns the CSS
 * classes to put on a `.fi` element: the icon, plus its light variant where
 * the theme has one, which .generated/file-icons.css shows only on light
 * page themes (without <html data-dark>), so the first paint picks the
 * right one. Lookup follows VS Code: the whole name, then the extensions
 * longest first ("user.test.ts" tries "test.ts", then "ts"), then the
 * language. Names compare without case.
 */

type Table = Readonly<Record<string, string>>;
const T = ICONS as unknown as {
  file: string;
  folder: string;
  folderExpanded: string;
  fileNames: Table;
  fileExtensions: Table;
  languageIds: Table;
  folderNames: Table;
  folderNamesExpanded: Table;
  languageOf: Table;
  light: { fileNames: Table; fileExtensions: Table; languageIds: Table; folderNames: Table; folderNamesExpanded: Table };
};

function fileIconName(name: string, light: boolean): string {
  const n = name.toLowerCase();
  const pick = (key: "fileNames" | "fileExtensions" | "languageIds", k: string) => (light && T.light[key][k]) || T[key][k];
  const byName = pick("fileNames", n);
  if (byName) return byName;
  const parts = n.split(".");
  for (let i = 1; i < parts.length; i++) {
    const byExt = pick("fileExtensions", parts.slice(i).join("."));
    if (byExt) return byExt;
  }
  const lang = T.languageOf[n] ?? (parts.length > 1 ? parts[parts.length - 1] : "");
  return (lang && pick("languageIds", lang)) || T.file;
}

function folderIconName(name: string, open: boolean, light: boolean): string {
  const n = name.toLowerCase();
  const key = open ? "folderNamesExpanded" : "folderNames";
  return (light && T.light[key][n]) || T[key][n] || (open ? T.folderExpanded : T.folder);
}

const classes = (dark: string, light: string) => (light === dark ? `fi fi-${dark}` : `fi fi-${dark} fl-${light}`);

/** The classes for a file's icon. */
export function fileIconClass(name: string): string {
  return classes(fileIconName(name, false), fileIconName(name, true));
}

/** The classes for a folder's icon, open or closed. */
export function folderIconClass(name: string, open: boolean): string {
  return classes(folderIconName(name, open, false), folderIconName(name, open, true));
}
