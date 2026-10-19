import { clock } from "./dates.js";
import { WilmaError, type FetchResult } from "./wilma.js";

export interface SchedulerOptions {
  cutoffMinutes: number;
  refreshMinutes: number;
  activeStart: number;
  activeEnd: number;
  notifyEnabled: boolean;
}

export interface PersistedState {
  /** Local date when the day's notification decision was made. */
  notifiedDate?: string;
  /** Local date of the forced fetch before the cutoff. */
  cutoffFetchDate?: string;
}

export interface SchedulerDeps {
  fetch: (today: string) => Promise<FetchResult>;
  /** Re-render and publish all entities from the latest data. */
  publish: (data: FetchResult, today: string, nowMinutes: number) => void;
  publishStatus: (status: { lastUpdate?: Date; problem: string | null; code?: string }) => void;
  /** Send the daily notification; return false when there was nothing to send. */
  notify: (data: FetchResult, today: string) => Promise<boolean>;
  loadState: () => PersistedState;
  saveState: (state: PersistedState) => void;
  now: () => Date;
  timeZone: string;
  log: (msg: string) => void;
}

const MINUTE = 60_000;
const PRE_CUTOFF_MINUTES = 5;
const NOTIFY_GRACE_MINUTES = 120;
const MANUAL_DEBOUNCE = 5 * MINUTE;
const AUTH_RETRY = 6 * 60 * MINUTE;
const STALE_FOR_NOTIFY = 12 * 60 * MINUTE;

export class Scheduler {
  private data: FetchResult | null = null;
  private fetching = false;
  private failures = 0;
  private lastAttempt = 0;
  private nextFetchAt = 0;
  private authBlocked = false;
  private viewKey = "";
  private state: PersistedState;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly opts: SchedulerOptions,
    private readonly deps: SchedulerDeps
  ) {
    this.state = deps.loadState();
  }

  start(intervalMs = 30_000) {
    void this.refresh("startup").then(() => this.tick());
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop() {
    clearInterval(this.timer);
  }

  /** Refresh button. */
  requestRefresh() {
    const since = this.deps.now().getTime() - this.lastAttempt;
    if (this.fetching || since < MANUAL_DEBOUNCE) {
      this.deps.log(`Refresh ignored: last fetch ${Math.round(since / 1000)} s ago`);
      return;
    }
    void this.refresh("button").then(() => this.tick());
  }

  private isActive(minutes: number): boolean {
    const { activeStart: s, activeEnd: e } = this.opts;
    return s <= e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
  }

  async tick(): Promise<void> {
    if (this.fetching) return;
    const now = this.deps.now();
    const c = clock(now, this.deps.timeZone);
    const { cutoffMinutes } = this.opts;
    const inCutoffWindow = c.minutes >= cutoffMinutes - PRE_CUTOFF_MINUTES && c.minutes < cutoffMinutes + NOTIFY_GRACE_MINUTES;

    if (inCutoffWindow && this.state.cutoffFetchDate !== c.date && !this.authBlocked) {
      this.state.cutoffFetchDate = c.date;
      this.deps.saveState(this.state);
      // A fetch within the window (e.g. at startup) is fresh enough.
      if (now.getTime() - this.lastAttempt > PRE_CUTOFF_MINUTES * MINUTE) await this.refresh("cutoff");
    } else if (this.isActive(c.minutes) && now.getTime() >= this.nextFetchAt) {
      await this.refresh("interval");
    }

    // The card switches to the next day at the cutoff even without new data.
    const key = `${c.date}|${c.minutes >= cutoffMinutes}`;
    if (this.data && key !== this.viewKey) {
      this.viewKey = key;
      this.deps.publish(this.data, c.date, c.minutes);
    }

    if (
      this.opts.notifyEnabled &&
      c.minutes >= cutoffMinutes &&
      c.minutes < cutoffMinutes + NOTIFY_GRACE_MINUTES &&
      this.state.notifiedDate !== c.date &&
      this.data
    ) {
      this.state.notifiedDate = c.date;
      this.deps.saveState(this.state);
      if (now.getTime() - this.data.fetchedAt.getTime() > STALE_FOR_NOTIFY) {
        this.deps.log("Daily notification skipped: Wilma data is stale");
      } else {
        try {
          const sent = await this.deps.notify(this.data, c.date);
          this.deps.log(sent ? "Daily notification sent" : "No school tomorrow: no notification");
        } catch (err) {
          this.deps.log(`Notification failed: ${(err as Error).message}`);
        }
      }
    }
  }

  private async refresh(reason: string): Promise<void> {
    if (this.fetching) return;
    this.fetching = true;
    const now = this.deps.now();
    this.lastAttempt = now.getTime();
    const c = clock(now, this.deps.timeZone);
    try {
      const data = await this.deps.fetch(c.date);
      this.data = data;
      this.failures = 0;
      this.authBlocked = false;
      this.nextFetchAt = now.getTime() + this.opts.refreshMinutes * MINUTE;
      this.viewKey = `${c.date}|${c.minutes >= this.opts.cutoffMinutes}`;
      this.deps.publish(data, c.date, c.minutes);
      const warnings = [...data.warnings, ...data.students.flatMap((s) => s.warnings)];
      this.deps.publishStatus({ lastUpdate: data.fetchedAt, problem: warnings.length ? warnings.join("; ") : null, code: warnings.length ? "partial" : undefined });
      this.deps.log(`Fetched (${reason}): ${data.students.length} student(s)${warnings.length ? `, warnings: ${warnings.join("; ")}` : ""}`);
    } catch (err) {
      this.failures += 1;
      const auth = err instanceof WilmaError && err.isAuth;
      this.authBlocked = auth;
      // Auth errors wait long: repeated failed logins can lock the Wilma account.
      const delay = auth ? AUTH_RETRY : Math.min(5 * 2 ** (this.failures - 1), this.opts.refreshMinutes) * MINUTE;
      this.nextFetchAt = now.getTime() + delay;
      const code = err instanceof WilmaError ? err.code : "error";
      const hint = err instanceof WilmaError && err.hint ? ` (${err.hint})` : "";
      this.deps.publishStatus({ problem: `${(err as Error).message}${hint}`, code });
      this.deps.log(`Fetch failed (${reason}, ${code}): ${(err as Error).message}; retry in ${Math.round(delay / MINUTE)} min`);
    } finally {
      this.fetching = false;
    }
  }
}
