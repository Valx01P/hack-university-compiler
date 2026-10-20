// Unit tests for the Model. They use only the store's public methods, so they
// keep passing however the store is written inside, as long as it behaves.
import { describe, expect, it } from "vitest";
import { countActive, filterTasks, isFilter, TaskStore } from "../../src/model/task-store.js";

const milk = { id: "a", title: "Buy milk", done: false };
const plants = { id: "b", title: "Water the plants", done: true };
const call = { id: "c", title: "Call Ada", done: false };

describe("the tasks list", () => {
  it("starts with the tasks it is given", () => {
    expect(new TaskStore([milk, plants]).tasks).toEqual([milk, plants]);
  });

  it("is frozen, so only the store's methods can change it", () => {
    const store = new TaskStore([milk]);
    expect(() => store.tasks.push(call)).toThrow(TypeError);
    expect(() => {
      store.tasks[0].done = true;
    }).toThrow(TypeError);
  });

  it("is a copy of the array the store started with", () => {
    const start = [milk];
    const store = new TaskStore(start);
    start.push(call);
    expect(store.tasks).toEqual([milk]);
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
