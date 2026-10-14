import { beforeEach, describe, expect, it, vi } from "vitest";
import { needsNextWeek, Scheduler, type PersistedState, type SchedulerDeps } from "../src/scheduler.js";
import { WilmaError, type FetchResult } from "../src/wilma.js";

const TZ = "Europe/Helsinki";
// Helsinki is UTC+3 in October.
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+03:00`);

const opts = { cutoffMinutes: 16 * 60, refreshMinutes: 60, activeStart: 6 * 60 + 30, activeEnd: 21 * 60 + 30, notifyEnabled: true };

function setup(start: Date) {
  let now = start;
  let state: PersistedState = {};
  const data = (): FetchResult => ({ fetchedAt: now, students: [], warnings: [] });
  const deps = {
    fetch: vi.fn(async () => data()),
    publish: vi.fn(),
    publishStatus: vi.fn(),
    notify: vi.fn(async () => true),
    loadState: () => state,
    saveState: (s: PersistedState) => {
      state = { ...s };
    },
    now: () => now,
    timeZone: TZ,
    log: () => undefined,
  } satisfies SchedulerDeps;
  const scheduler = new Scheduler(opts, deps);
  return {
    deps,
    scheduler,
    set: (d: Date) => {
      now = d;
    },
  };
}

describe("Scheduler", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup(at("2026-10-14", "10:00"));
  });

  it("fetches during active hours at the configured interval", async () => {
    await s.scheduler.tick();
    expect(s.deps.fetch).toHaveBeenCalledTimes(1);
    s.set(at("2026-10-14", "10:30"));
    await s.scheduler.tick();
    expect(s.deps.fetch).toHaveBeenCalledTimes(1);
    s.set(at("2026-10-14", "11:00"));
    await s.scheduler.tick();
    expect(s.deps.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not fetch at night", async () => {
    s.set(at("2026-10-14", "23:00"));
    await s.scheduler.tick();
    s.set(at("2026-10-15", "03:00"));
    await s.scheduler.tick();
    expect(s.deps.fetch).not.toHaveBeenCalled();
    s.set(at("2026-10-15", "06:30"));
    await s.scheduler.tick();
    expect(s.deps.fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches before the cutoff and notifies once at the cutoff", async () => {
    await s.scheduler.tick(); // 10:00 fetch
    s.set(at("2026-10-14", "15:55"));
    await s.scheduler.tick();
    expect(s.deps.fetch).toHaveBeenCalledTimes(2); // forced pre-cutoff fetch
    expect(s.deps.notify).not.toHaveBeenCalled();

    s.set(at("2026-10-14", "16:00"));
    await s.scheduler.tick();
    expect(s.deps.notify).toHaveBeenCalledTimes(1);
    expect(s.deps.notify.mock.calls[0][1]).toBe("2026-10-14");
    // Card re-rendered for "after cutoff".
    expect(s.deps.publish.mock.calls.at(-1)?.[2]).toBe(16 * 60);

    s.set(at("2026-10-14", "16:30"));
    await s.scheduler.tick();
    expect(s.deps.notify).toHaveBeenCalledTimes(1);
  });

  it("does not fetch twice when started just before the cutoff", async () => {
    s.set(at("2026-10-14", "15:57"));
    s.scheduler.requestRefresh(); // like the startup fetch
    await vi.waitFor(() => expect(s.deps.fetch).toHaveBeenCalledTimes(1));
    s.set(at("2026-10-14", "15:58"));
    await s.scheduler.tick(); // in the pre-cutoff window, but data is fresh
    expect(s.deps.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not notify long after the cutoff (e.g. add-on restarted at night)", async () => {
    s.set(at("2026-10-14", "20:00"));
    await s.scheduler.tick();
    expect(s.deps.notify).not.toHaveBeenCalled();
  });

  it("backs off after errors and waits long after auth errors", async () => {
    s.deps.fetch.mockRejectedValueOnce(new WilmaError("network", "down"));
    await s.scheduler.tick();
    expect(s.deps.publishStatus).toHaveBeenLastCalledWith({ problem: "down", code: "network" });
    s.set(at("2026-10-14", "10:05"));
    await s.scheduler.tick();
    expect(s.deps.fetch).toHaveBeenCalledTimes(2); // 5 min retry

    s.deps.fetch.mockRejectedValueOnce(new WilmaError("login_failed", "bad password", "Run `wilma login` again."));
    s.set(at("2026-10-14", "11:05"));
    await s.scheduler.tick();
    expect(s.deps.fetch).toHaveBeenCalledTimes(3);
    s.set(at("2026-10-14", "15:58")); // no forced cutoff fetch while auth is failing
    await s.scheduler.tick();
    expect(s.deps.fetch).toHaveBeenCalledTimes(3);
    s.set(at("2026-10-14", "17:06")); // 6 h later
    await s.scheduler.tick();
    expect(s.deps.fetch).toHaveBeenCalledTimes(4);
  });

  it("debounces the refresh button", async () => {
    await s.scheduler.tick();
    s.scheduler.requestRefresh();
    await Promise.resolve();
    expect(s.deps.fetch).toHaveBeenCalledTimes(1);
    s.set(at("2026-10-14", "10:06"));
    s.scheduler.requestRefresh();
    await vi.waitFor(() => expect(s.deps.fetch).toHaveBeenCalledTimes(2));
  });
});

describe("needsNextWeek", () => {
  it("is needed from Thursday on and for several days ahead", () => {
    expect(needsNextWeek("2026-10-14", 1)).toBe(false); // Wed
    expect(needsNextWeek("2026-10-15", 1)).toBe(true); // Thu
    expect(needsNextWeek("2026-10-18", 1)).toBe(true); // Sun
    expect(needsNextWeek("2026-10-12", 2)).toBe(true);
  });
});
