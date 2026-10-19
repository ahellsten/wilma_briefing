import { addDays } from "./dates.js";
import type { Exam, Grade, Homework, Lesson, MessageSummary, StudentData, StudentRef } from "./wilma.js";

export interface BriefingConfig {
  cutoffMinutes: number;
  daysAhead: number;
  lookbackDays: number;
}

export interface BriefingLesson extends Lesson {
  homework: Homework[];
}

export interface OpenHomework extends Homework {
  /** Date of the subject's next lesson after the homework was given. */
  due: string | null;
}

export interface BriefingDay {
  date: string;
  lessons: BriefingLesson[];
  firstStart: string | null;
  lastEnd: string | null;
  exams: Exam[];
}

/** A grade counts as new for this many days after the add-on first saw it. */
export const NEW_GRADE_DAYS = 7;

export interface Briefing {
  student: StudentRef;
  today: string;
  /** "today" before the cutoff (when today is a school day), otherwise "next". */
  mode: "today" | "next";
  days: BriefingDay[];
  /** Homework not yet due, soonest first. */
  homework: OpenHomework[];
  upcomingExams: Exam[];
  nextExam: Exam | null;
  /** Grades first seen within NEW_GRADE_DAYS, newest first. */
  newGrades: Grade[];
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
 * Homework still to do on `from` (the first day shown). Wilma has no due dates,
 * so homework counts as due at the subject's next lesson after the day it was
 * given. Newer homework of the subject marks a lesson too (it is dated on one),
 * which covers lessons missing from the fetched schedule. `due` is null when
 * neither shows the next lesson.
 */
export function openHomework(lessons: Lesson[], homework: Homework[], from: string, lookbackDays: number): OpenHomework[] {
  const windowStart = addDays(from, -lookbackDays);
  const next = (h: Homework) => {
    const later = [...lessons, ...homework].filter((x) => x.date > h.date && sameSubject(x, h)).map((x) => x.date);
    return later.length ? later.reduce((a, b) => (b < a ? b : a)) : null;
  };
  return homework
    .filter((h) => h.date >= windowStart)
    .map((h) => ({ ...h, due: next(h) }))
    .filter((h) => h.due === null || h.due >= from)
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.subject.localeCompare(b.subject));
}

export function newGrades(grades: Grade[], today: string): Grade[] {
  const since = addDays(today, -(NEW_GRADE_DAYS - 1));
  // Grades not tracked yet (no `seen`) are never new.
  return grades
    .filter((g) => g.seen !== undefined && g.seen >= since)
    .sort((a, b) => b.seen!.localeCompare(a.seen!) || b.date.localeCompare(a.date));
}

export function buildBriefing(data: StudentData, today: string, nowMinutes: number, cfg: BriefingConfig): Briefing {
  const { mode, dates } = selectTargetDays(
    data.lessons.map((l) => l.date),
    today,
    nowMinutes,
    cfg
  );

  const homework = openHomework(data.lessons, data.homework, dates[0] ?? today, cfg.lookbackDays);

  const days = dates.map((date): BriefingDay => {
    const seenSubjects: Lesson[] = [];
    const dayLessons = data.lessons
      .filter((l) => l.date === date)
      .map((l): BriefingLesson => {
        // A double lesson gets its homework once, on the first of the pair.
        const repeat = seenSubjects.some((s) => sameSubject(s, l));
        seenSubjects.push(l);
        return { ...l, homework: repeat ? [] : homework.filter((h) => h.due === date && sameSubject(h, l)) };
      });
    return {
      date,
      lessons: dayLessons,
      firstStart: dayLessons[0]?.start ?? null,
      lastEnd: dayLessons.reduce<string | null>((max, l) => (max === null || l.end > max ? l.end : max), null),
      exams: data.exams.filter((e) => e.date === date),
    };
  });

  const upcomingExams = data.exams.filter((e) => e.date >= today);
  return {
    student: data.student,
    today,
    mode,
    days,
    homework,
    upcomingExams,
    nextExam: upcomingExams[0] ?? null,
    newGrades: newGrades(data.grades ?? [], today),
    unreadMessages: data.unreadMessages,
    unreadCount: data.unreadCount,
    warnings: data.warnings,
  };
}
