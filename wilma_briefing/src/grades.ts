import type { StudentData } from "./wilma.js";

/**
 * When the add-on first saw each grade, per student number and exam id.
 * A grade's `date` is the exam day; the grade is often entered days later,
 * so "new" is measured from when it first showed up.
 */
export type GradesSeen = Record<string, Record<string, { seen: string; notified: boolean }>>;

/**
 * Records grades not seen before as seen `today`. A student's first fetch
 * seeds the existing grades with their exam dates (already notified), so they
 * don't all show up as new. Forgets grades that dropped out of the list.
 */
export function trackGrades(prev: GradesSeen, students: StudentData[], today: string): GradesSeen {
  const next: GradesSeen = { ...prev };
  for (const s of students) {
    if (!s.grades) continue;
    const sn = s.student.studentNumber;
    const known = prev[sn];
    next[sn] = Object.fromEntries(
      s.grades.map((g) => [String(g.examId), known?.[g.examId] ?? (known ? { seen: today, notified: false } : { seen: g.date, notified: true })])
    );
  }
  return next;
}

/** Copies the seen dates and notified flags onto the fetched grades. */
export function withSeen(students: StudentData[], seen: GradesSeen): StudentData[] {
  return students.map((s) => ({
    ...s,
    grades: s.grades?.map((g) => ({ ...g, ...(seen[s.student.studentNumber]?.[g.examId] ?? {}) })),
  }));
}

export function markNotified(seen: GradesSeen, ids: { studentNumber: string; examId: number }[]): GradesSeen {
  const next: GradesSeen = { ...seen };
  for (const { studentNumber, examId } of ids) {
    const entry = next[studentNumber]?.[examId];
    if (entry) next[studentNumber] = { ...next[studentNumber], [examId]: { ...entry, notified: true } };
  }
  return next;
}
