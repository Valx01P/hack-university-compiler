// Reads and writes the inventory file. Loading checks the file with the guards in guards.ts
// (upgrading version 1 files on the way), and saving writes a temporary file first and
// then renames it over the real one, so a crash mid-write never leaves half a file.
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { CliError } from "../errors.ts";
import { isInventoryFile, isInventoryV1, type InventoryFile } from "./guards.ts";
import { migrateV1 } from "./migrate.ts";

export async function loadInventory(path: string): Promise<InventoryFile> {
  const shown = relative(process.cwd(), path) || path;
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) throw new CliError(`No inventory file at ${shown}. Run npm run data:reset to start from the sample.`);
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new CliError(`${shown} is not valid JSON`);
  }
  if (isInventoryFile(json)) return json;
  if (isInventoryV1(json)) return migrateV1(json);
  throw new CliError(`Invalid inventory file ${shown}: it does not look like a Stockroom inventory`);
}

export async function saveInventory(path: string, inventory: InventoryFile): Promise<void> {
  // data/inventory.json is written as data/.inventory.tmp first. rename replaces the old
  // file in one step, so a reader sees the old inventory or the new one, never a mix.
  const temporary = join(dirname(path), `.${basename(path, ".json")}.tmp`);
  await writeFile(temporary, `${JSON.stringify(inventory, null, 2)}\n`);
  await rename(temporary, path);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** What commands use to read and write the inventory, so tests can hand them another one. */
export type Store = {
  readonly load: () => Promise<InventoryFile>;
  readonly save: (inventory: InventoryFile) => Promise<void>;
};

export class JsonStore implements Store {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  load(): Promise<InventoryFile> {
    return loadInventory(this.#path);
  }

  save(inventory: InventoryFile): Promise<void> {
    return saveInventory(this.#path, inventory);
  }
}
