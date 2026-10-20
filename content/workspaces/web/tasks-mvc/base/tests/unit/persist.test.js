// Unit tests for persistence. Each test passes its own in-memory storage, so
// nothing depends on the browser or on what an earlier test saved.
import { describe, expect, it, vi } from "vitest";
import { loadTasks, saveTasks, STORAGE_KEY } from "../../src/model/persist.js";

/** The part of the Storage interface persist.js uses, kept in a Map. */
class MemoryStorage {
  #items = new Map();

  getItem(key) {
    return this.#items.get(key) ?? null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }
}

/** A storage that refuses every call, as a browser does when storage is full or blocked. */
const refusingStorage = {
  getItem() {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
  setItem() {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  },
};

const tasks = [
  { id: "a", title: "Buy milk", done: false },
  { id: "b", title: "Water the plants", done: true },
];

describe("saveTasks and loadTasks", () => {
  it("save under tasks:v1 and load the same tasks back", () => {
    const storage = new MemoryStorage();
    expect(saveTasks(tasks, storage)).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY))).toEqual(tasks);
    expect(loadTasks(storage)).toEqual(tasks);
  });

  it("save only the fields a task has", () => {
    const storage = new MemoryStorage();
    saveTasks([{ ...tasks[0], editing: true }], storage);
    expect(loadTasks(storage)).toEqual([tasks[0]]);
  });

  it("load null when nothing is saved", () => {
    expect(loadTasks(new MemoryStorage())).toBeNull();
  });
});

describe("loadTasks with bad data", () => {
  it.each([
    ["text that is not JSON", "{not json"],
    ["JSON that is not a list", '{"tasks":[]}'],
    ["a task without a title", '[{"id":"a","done":false}]'],
    ["a task whose done is a string", '[{"id":"a","title":"Buy milk","done":"no"}]'],
  ])("returns null for %s, with a warning", (_, saved) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, saved);
    expect(loadTasks(storage)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("returns null when the browser blocks storage", () => {
    expect(loadTasks(refusingStorage)).toBeNull();
  });
});

describe("saveTasks when the browser refuses", () => {
  it("returns false instead of throwing", () => {
    expect(saveTasks(tasks, refusingStorage)).toBe(false);
  });
});
