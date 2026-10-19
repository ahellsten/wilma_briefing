import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildBriefing, type Briefing } from "./briefing.js";
import { addDays } from "./dates.js";
import { markNotified, trackGrades, withSeen, type GradesSeen } from "./grades.js";
import { brokerConfig, HaMqtt } from "./mqtt.js";
import { loadOptions } from "./options.js";
import { briefingState, renderHtml, renderMarkdown, renderNotification, unnotifiedGrades } from "./render.js";
import { needsNextWeek, Scheduler, type PersistedState } from "./scheduler.js";
import { notify } from "./supervisor.js";
import { applyNameDisplay, cliRunner, fetchAll, wilmaEnv, type FetchResult } from "./wilma.js";

const STATE_PATH = process.env.STATE_PATH ?? "/data/state.json";
const GRADES_PATH = process.env.GRADES_PATH ?? "/data/grades_seen.json";
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

async function main() {
  const opts = loadOptions();
  const timeZone = process.env.TZ || "Europe/Helsinki";
  const configPath = process.env.WILMAI_CONFIG_PATH ?? "/data/wilmai/config.json";
  mkdirSync(dirname(configPath), { recursive: true });

  const run = cliRunner(wilmaEnv(opts));
  const cfg = { cutoffMinutes: opts.cutoffMinutes, daysAhead: opts.daysAhead, lookbackDays: opts.lookbackDays, newGradeDays: opts.newGradeDays };
  let gradesSeen: GradesSeen = {};
  try {
    gradesSeen = JSON.parse(readFileSync(GRADES_PATH, "utf8")) as GradesSeen;
  } catch {
    // First start: existing grades are seeded as already seen.
  }
  const saveGrades = (next: GradesSeen) => {
    gradesSeen = next;
    writeFileSync(GRADES_PATH, JSON.stringify(gradesSeen));
  };
  const briefings = (data: FetchResult, today: string, minutes: number): Briefing[] =>
    withSeen(data.students, gradesSeen).map((s) => buildBriefing(s, today, minutes, cfg));

  let scheduler: Scheduler | undefined;
  const ha = await HaMqtt.connect(await brokerConfig(), () => scheduler?.requestRefresh(), log);
  log(`Connected to MQTT; time zone ${timeZone}`);

  scheduler = new Scheduler(opts, {
    fetch: async (today) => {
      const data = applyNameDisplay(await fetchAll(run, { includeNextWeek: needsNextWeek(today, opts.daysAhead) }), opts.nameDisplay);
      saveGrades(trackGrades(gradesSeen, data.students, today));
      return data;
    },
    publish: (data, today, minutes) => {
      for (const b of briefings(data, today, minutes)) {
        const render = { showRooms: opts.showRooms };
        ha.publishBriefing(b, briefingState(b, opts.language), renderMarkdown(b, opts.language, render), renderHtml(b, opts.language, render));
      }
    },
    publishStatus: (status) => ha.publishStatus(status),
    notify: async (data, today) => {
      // Called after the cutoff: briefings show the next school day(s).
      const list = briefings(data, today, 24 * 60);
      const target = list.map((b) => b.days[0]?.date).filter(Boolean).sort()[0];
      // Only the evening before a school day (Sunday for Monday, not Friday).
      if (!target || target !== addDays(today, 1) || !opts.notifyServices.length) return false;
      const { title, message } = renderNotification(list, target, today, opts.language);
      for (const service of opts.notifyServices) await notify(service, title, message);
      // Each new grade is announced once.
      saveGrades(markNotified(gradesSeen, list.flatMap((b) => unnotifiedGrades(b).map((g) => ({ studentNumber: b.student.studentNumber, examId: g.examId })))));
      return true;
    },
    loadState: () => {
      try {
        return JSON.parse(readFileSync(STATE_PATH, "utf8")) as PersistedState;
      } catch {
        return {};
      }
    },
    saveState: (state) => writeFileSync(STATE_PATH, JSON.stringify(state)),
    now: () => new Date(),
    timeZone,
    log,
  });
  scheduler.start();

  const shutdown = async () => {
    log("Stopping");
    scheduler?.stop();
    await ha.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
