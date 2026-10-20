// Runs before every test file. Tests happen at the course's frozen moment, 2026-10-01T09:00Z,
// so "now", new timestamps, and token expiries are the same on every run. Only Date is faked:
// timers stay real, so database drivers and supertest behave normally. A test can still move
// the clock with vi.setSystemTime().
import { beforeEach, vi } from "vitest";

vi.useFakeTimers({ toFake: ["Date"] });

beforeEach(() => {
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
});
