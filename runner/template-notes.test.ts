import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { refreshHiddenNotes } from "./workspaces.ts";

/**
 * A template's hidden notes (the compiler folder's AGENTS.md for AI tools)
 * follow the template when it changes, unless the learner made them theirs.
 */
describe("a template's hidden notes", () => {
  it("follow the template where the learner left them as they were, and stay theirs where they didn't", () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "hu-notes-"));
    const dirs = { files: path.join(root, "files"), before: path.join(root, "before"), after: path.join(root, "after") };
    for (const d of Object.values(dirs)) fs.mkdirSync(path.join(d, ".hu"), { recursive: true });
    const put = (dir: string, rel: string, text: string) => fs.writeFileSync(path.join(dir, rel), text);
    const read = (rel: string) => (fs.existsSync(path.join(dirs.files, rel)) ? fs.readFileSync(path.join(dirs.files, rel), "utf8") : null);
    try {
      // As the old template had it: takes the new one.
      put(dirs.before, "AGENTS.md", "old notes");
      put(dirs.after, "AGENTS.md", "new notes");
      put(dirs.files, "AGENTS.md", "old notes");
      // Edited by the learner: stays.
      put(dirs.before, "CLAUDE.md", "@AGENTS.md");
      put(dirs.after, "CLAUDE.md", "@AGENTS.md\n");
      put(dirs.files, "CLAUDE.md", "my own");
      // Removed by the learner: stays removed.
      put(dirs.before, ".hu/gone.md", "x");
      put(dirs.after, ".hu/gone.md", "y");
      // New in the template: arrives.
      put(dirs.after, ".hu/new.md", "hello");
      // Dropped by the template, untouched here: goes.
      put(dirs.before, ".hu/old.md", "z");
      put(dirs.files, ".hu/old.md", "z");
      // Not hidden: the learner's code, never touched.
      put(dirs.before, "Main.java", "a");
      put(dirs.after, "Main.java", "b");
      put(dirs.files, "Main.java", "a");
      refreshHiddenNotes(dirs.files, dirs.before, dirs.after, ["AGENTS.md", "CLAUDE.md", ".hu/gone.md", ".hu/new.md", ".hu/old.md", "Main.java", "../escape"], ["AGENTS.md", "CLAUDE.md", ".hu"]);
      assert.equal(read("AGENTS.md"), "new notes");
      assert.equal(read("CLAUDE.md"), "my own");
      assert.equal(read(".hu/gone.md"), null);
      assert.equal(read(".hu/new.md"), "hello");
      assert.equal(read(".hu/old.md"), null);
      assert.equal(read("Main.java"), "a");
      assert.equal(fs.existsSync(path.join(root, "escape")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
