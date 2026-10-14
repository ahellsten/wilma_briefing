import { addDays } from "./dates.js";
import type { Exam, Homework, Lesson, MessageSummary, StudentData, StudentRef } from "./wilma.js";

export interface BriefingConfig {
  cutoffMinutes: number;
  daysAhead: number;
  lookbackDays: number;
}

export interface BriefingLesson extends Lesson {
  homework: Homework[];
}

export interface BriefingDay {
  date: string;
  lessons: BriefingLesson[];
  firstStart: string | null;
  lastEnd: string | null;
  exams: Exam[];
}

export interface Briefing {
  student: StudentRef;
  today: string;
  /** "today" before the cutoff (when today is a school day), otherwise "next". */
  mode: "today" | "next";
  days: BriefingDay[];
  homeworkCount: number;
  upcomingExams: Exam[];
  nextExam: Exam | null;
  unreadMessages: MessageSummary[];
  unreadCount: number;
  warnings: string[];
}

/**
 * Which school days to show. A school day is a date with lessons in the
 * fetched schedule, so holidays are skipped automatically.
 */
export function selectTargetDays(
  lessonDates: Iterable<string>,
  today: string,
  nowMinutes: number,
  cfg: Pick<BriefingConfig, "cutoffMinutes" | "daysAhead">
): { mode: "today" | "next"; dates: string[] } {
  const dates = [...new Set(lessonDates)].sort();
  if (nowMinutes < cfg.cutoffMinutes && dates.includes(today)) return { mode: "today", dates: [today] };
  return { mode: "next", dates: dates.filter((d) => d > today).slice(0, cfg.daysAhead) };
}

function normCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Subject prefix of a course code: "MA_8LV" / "MA.8" / "MA 8" -> "MA". */
function codeStem(code: string): string {
  return normCode(code).split(/[_.\s]/)[0].replace(/\d+[A-Z]*$/, "");
}

function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[,;:/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Same subject? Names decide when both have one ("Englanti" = "Englanti, A1");
 * codes are only a fallback, since a class teacher's lessons may share one group code.
 */
export function sameSubject(a: { subject: string; subjectCode: string }, b: { subject: string; subjectCode: string }): boolean {
  const na = normName(a.subject);
  const nb = normName(b.subject);
  if (na && nb) return na === nb || na.startsWith(nb + " ") || nb.startsWith(na + " ");
  if (!a.subjectCode || !b.subjectCode) return false;
  if (normCode(a.subjectCode) === normCode(b.subjectCode)) return true;
  const stem = codeStem(a.subjectCode);
  return Boolean(stem) && stem === codeStem(b.subjectCode);
}

/**
 * Homework due at a lesson on `date`. Wilma has no due dates, so homework
 * counts as due at the subject's next lesson: the newest items given since the
 * previous known lesson of the subject (and within the lookback window).
 */
export function homeworkFor(lesson: Lesson, allLessons: Lesson[], homework: Homework[], lookbackDays: number): Homework[] {
  const windowStart = addDays(lesson.date, -lookbackDays);
  const previous = allLessons
    .filter((l) => l.date < lesson.date && l.date >= windowStart && sameSubject(l, lesson))
    .map((l) => l.date)
    .sort()
    .pop();
  const from = previous ?? windowStart;
  const due = homework
    .filter((h) => h.date >= from && h.date < lesson.date && sameSubject(h, lesson))
    .sort((a, b) => b.date.localeCompare(a.date));
  // Homework is dated on a lesson of the subject, so anything older than the
  // newest item was due by then (covers lessons missing from the schedule).
  return due.filter((h) => h.date === due[0].date);
}

export function buildBriefing(data: StudentData, today: string, nowMinutes: number, cfg: BriefingConfig): Briefing {
  const { mode, dates } = selectTargetDays(
    data.lessons.map((l) => l.date),
    today,
    nowMinutes,
    cfg
  );

  const days = dates.map((date): BriefingDay => {
    const seenSubjects: Lesson[] = [];
    const lessons = data.lessons
      .filter((l) => l.date === date)
      .map((l): BriefingLesson => {
        // A double lesson shows its homework once, on the first of the pair.
        const repeat = seenSubjects.some((s) => sameSubject(s, l));
        seenSubjects.push(l);
        return { ...l, homework: repeat ? [] : homeworkFor(l, data.lessons, data.homework, cfg.lookbackDays) };
      });
    return {
      date,
      lessons,
      firstStart: lessons[0]?.start ?? null,
      lastEnd: lessons.reduce<string | null>((max, l) => (max === null || l.end > max ? l.end : max), null),
      exams: data.exams.filter((e) => e.date === date),
    };
  });

  const upcomingExams = data.exams.filter((e) => e.date >= today);
  return {
    student: data.student,
    today,
    mode,
    days,
    homeworkCount: days.reduce((n, d) => n + d.lessons.reduce((m, l) => m + l.homework.length, 0), 0),
    upcomingExams,
    nextExam: upcomingExams[0] ?? null,
    unreadMessages: data.unreadMessages,
    unreadCount: data.unreadCount,
    warnings: data.warnings,
  };
}
