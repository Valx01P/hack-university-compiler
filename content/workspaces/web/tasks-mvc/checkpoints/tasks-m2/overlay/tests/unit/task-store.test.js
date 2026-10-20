// Unit tests for the Model. They use only the store's public methods, so they
// keep passing however the store is written inside, as long as it behaves.
import { describe, expect, it, vi } from "vitest";
import { countActive, filterTasks, isFilter, TaskStore } from "../../src/model/task-store.js";

/** A store whose new tasks get the ids t1, t2, t3, and so on. */
function createStore(tasks = []) {
  let count = 0;
  return new TaskStore(tasks, { createId: () => `t${++count}` });
}

const milk = { id: "a", title: "Buy milk", done: false };
const plants = { id: "b", title: "Water the plants", done: true };
const call = { id: "c", title: "Call Ada", done: false };

describe("add", () => {
  it("adds an unfinished task with a trimmed title to the end", () => {
    const store = createStore([milk]);
    const task = store.add("  Walk the dog \n");
    expect(task).toEqual({ id: "t1", title: "Walk the dog", done: false });
    expect(store.tasks).toEqual([milk, task]);
  });

  it("ignores blank titles", () => {
    const store = createStore([milk]);
    expect(store.add("")).toBeNull();
    expect(store.add("   \t ")).toBeNull();
    expect(store.tasks).toEqual([milk]);
  });

  it("gives each new task its own id", () => {
    const store = createStore();
    store.add("One");
    store.add("Two");
    expect(store.tasks.map((task) => task.id)).toEqual(["t1", "t2"]);
  });
});

describe("subscribe", () => {
  it("calls listeners with the new list after each change", () => {
    const store = createStore([milk]);
    const listener = vi.fn();
    store.subscribe(listener);
    store.add("Call Ada");
    store.add("Walk the dog");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(store.tasks);
  });

  it("stays quiet when nothing changed", () => {
    const store = createStore([milk]);
    const listener = vi.fn();
    store.subscribe(listener);
    store.add("  ");
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops calling a listener after it unsubscribes", () => {
    const store = createStore([milk]);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.add("Call Ada");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("the tasks list", () => {
  it("is frozen, so only the store's methods can change it", () => {
    const store = createStore([milk]);
    expect(() => store.tasks.push(call)).toThrow(TypeError);
    expect(() => {
      store.tasks[0].done = true;
    }).toThrow(TypeError);
  });

  it("is a copy of the array the store started with", () => {
    const start = [milk];
    const store = createStore(start);
    start.push(call);
    expect(store.tasks).toEqual([milk]);
    store.add("Walk the dog");
    expect(start).toEqual([milk, call]);
  });
});

describe("filters", () => {
  const tasks = [milk, plants, call];

  it("show all, active, or completed tasks", () => {
    expect(filterTasks(tasks, "all")).toEqual(tasks);
    expect(filterTasks(tasks, "active")).toEqual([milk, call]);
    expect(filterTasks(tasks, "completed")).toEqual([plants]);
  });

  it("know their own names", () => {
    expect(isFilter("active")).toBe(true);
    expect(isFilter("toString")).toBe(false);
    expect(isFilter(null)).toBe(false);
  });

  it("count the tasks left", () => {
    expect(countActive(tasks)).toBe(2);
  });
});
