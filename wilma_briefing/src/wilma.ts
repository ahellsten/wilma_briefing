import { execFile } from "node:child_process";

/*
 * Thin wrapper around the `wilma` CLI (@wilm-ai/wilma-cli 2.x). The CLI's JSON
 * output is its stable interface; shapes below mirror what it prints.
 */

export interface StudentRef {
  studentNumber: string;
  name: string;
  wilma?: string;
}

export interface Lesson {
  date: string; // YYYY-MM-DD
  start: string; // "08:15"
  end: string;
  subject: string;
  subjectCode: string;
  teacher: string;
  room?: string | null;
}

export interface Homework {
  date: string; // day of the lesson where it was given
  subject: string;
  subjectCode: string;
  homework: string;
  teacher: string;
}

export interface Exam {
  examId: number;
  date: string;
  time?: string | null;
  name: string;
  subject: string;
  subjectCode: string;
  topic: string | null;
  teacher: string;
}

export interface MessageSummary {
  wilmaId: number;
  subject: string;
  sentAt: string; // ISO with Finnish offset
  senderName: string | null;
  unread: boolean;
  replyCount: number;
}

export interface Summary {
  today: string;
  tomorrow: string;
  todaySchedule: Lesson[];
  tomorrowSchedule: Lesson[];
  upcomingExams: Exam[];
  homework: Homework[];
  messages: MessageSummary[];
  unreadMessages: number;
  unavailable?: string[];
}

interface PerStudent<T> {
  students: ({ student: StudentRef } & T)[];
  problems?: { wilma: string; message: string }[];
}

export type SummaryResult = PerStudent<{ summary: Summary }>;
export type HomeworkResult = PerStudent<{ homework: Homework[] }>;
export type ScheduleResult = PerStudent<{ lessons: Lesson[] }>;

/** Summary parts the briefing doesn't use; Wilma failing to give them is not a problem. */
const IGNORED_UNAVAILABLE = new Set(["lessonNotes", "news"]);

const AUTH_CODES = new Set(["login_failed", "mfa_required", "mfa_failed", "not_logged_in", "config_invalid"]);

export class WilmaError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string
  ) {
    super(message);
    this.name = "WilmaError";
  }

  get isAuth(): boolean {
    return AUTH_CODES.has(this.code);
  }
}

export type Runner = (args: string[]) => Promise<unknown>;

/** Runs `wilma <args> --json` and returns the parsed JSON, throwing WilmaError on CLI errors. */
export function cliRunner(env: NodeJS.ProcessEnv, bin = process.env.WILMA_BIN ?? "wilma"): Runner {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(
        bin,
        [...args, "--json"],
        { env, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
        (err, stdout, stderr) => {
          let parsed: any;
          try {
            parsed = stdout.trim() ? JSON.parse(stdout) : undefined;
          } catch {
            parsed = undefined;
          }
          if (parsed?.status === "error") {
            return reject(new WilmaError(parsed.code ?? "error", parsed.message ?? "Wilma error", parsed.hint));
          }
          if (err) {
            const message = (stderr || err.message).trim().split("\n")[0];
            return reject(new WilmaError((err as any).killed ? "timeout" : "error", message));
          }
          if (parsed === undefined) return reject(new WilmaError("error", "wilma printed no JSON"));
          resolve(parsed);
        }
      );
    });
}

export function wilmaEnv(opts: { tenant: string; username: string; password: string; totpSecret?: string }): NodeJS.ProcessEnv {
  return {
    ...process.env,
    WILMAI_CONFIG_PATH: process.env.WILMAI_CONFIG_PATH ?? "/data/wilmai/config.json",
    WILMAI_NO_UPDATE_CHECK: "1",
    WILMA_TENANT: opts.tenant,
    WILMA_USERNAME: opts.username,
    WILMA_PASSWORD: opts.password,
    ...(opts.totpSecret ? { WILMA_TOTP_SECRET: opts.totpSecret } : {}),
  };
}

/** Everything the briefing needs for one child, merged from several CLI calls. */
export interface StudentData {
  student: StudentRef;
  today: string;
  lessons: Lesson[];
  homework: Homework[];
  exams: Exam[];
  unreadMessages: MessageSummary[];
  unreadCount: number;
  warnings: string[];
}

export interface FetchResult {
  fetchedAt: Date;
  students: StudentData[];
  warnings: string[];
}

/**
 * One refresh: `summary` (required), then `homework --limit 30` and the
 * week schedule(s) (best effort). All calls reuse the CLI's cached session.
 */
export async function fetchAll(run: Runner, opts: { includeNextWeek: boolean }): Promise<FetchResult> {
  const summary = (await run(["summary"])) as SummaryResult;
  const warnings: string[] = (summary.problems ?? []).map((p) => `${p.wilma}: ${p.message}`);

  const optional = async <T>(args: string[]): Promise<T | undefined> => {
    try {
      return (await run(args)) as T;
    } catch (err) {
      if (err instanceof WilmaError && err.isAuth) throw err;
      warnings.push(`wilma ${args.join(" ")}: ${(err as Error).message}`);
      return undefined;
    }
  };
  const homework = await optional<HomeworkResult>(["homework", "--limit", "30"]);
  const week = await optional<ScheduleResult>(["schedule", "week"]);
  const nextWeek = opts.includeNextWeek ? await optional<ScheduleResult>(["schedule", "next-week"]) : undefined;

  const pick = <T,>(r: PerStudent<T> | undefined, sn: string) =>
    r?.students.find((s) => s.student.studentNumber === sn);

  const students = summary.students.map(({ student, summary: s }): StudentData => {
    const sn = student.studentNumber;
    const lessons = dedupe(
      [...s.todaySchedule, ...s.tomorrowSchedule, ...(pick(week, sn)?.lessons ?? []), ...(pick(nextWeek, sn)?.lessons ?? [])],
      (l) => `${l.date}|${l.start}|${l.subjectCode}|${l.subject}`
    ).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const hw = dedupe(
      [...s.homework, ...(pick(homework, sn)?.homework ?? [])],
      (h) => `${h.date}|${h.subjectCode}|${h.homework}`
    ).sort((a, b) => b.date.localeCompare(a.date));
    const unread = s.messages.filter((m) => m.unread);
    return {
      student,
      today: s.today,
      lessons,
      homework: hw,
      exams: [...s.upcomingExams].sort((a, b) => a.date.localeCompare(b.date)),
      unreadMessages: unread,
      unreadCount: Math.max(s.unreadMessages ?? 0, unread.length),
      warnings: (s.unavailable ?? []).filter((u) => !IGNORED_UNAVAILABLE.has(u)).map((u) => `unavailable: ${u}`),
    };
  });

  return { fetchedAt: new Date(), students, warnings };
}

export type NameDisplay = "first" | "full";

/**
 * Names as shown in Home Assistant. Wilma gives "Firstname Lastname"; "first"
 * keeps the first name, or the full name when siblings share a first name.
 */
export function applyNameDisplay(result: FetchResult, mode: NameDisplay): FetchResult {
  if (mode === "full") return result;
  const first = (name: string) => name.trim().split(/\s+/)[0] || name;
  const counts = new Map<string, number>();
  for (const s of result.students) counts.set(first(s.student.name), (counts.get(first(s.student.name)) ?? 0) + 1);
  return {
    ...result,
    students: result.students.map((s) => {
      const short = first(s.student.name);
      return counts.get(short) === 1 ? { ...s, student: { ...s.student, name: short } } : s;
    }),
  };
}

function dedupe<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(key(item))) seen.set(key(item), item);
  return [...seen.values()];
}
