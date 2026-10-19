import { describe, expect, it } from "vitest";
import { buildBriefing } from "../src/briefing.js";
import { renderMarkdown } from "../src/render.js";
import { fetchAll, type Runner } from "../src/wilma.js";

/*
 * Synthetic data in the shape real Wilmas return (checked against a primary
 * school's output, all values replaced): schedule subjectCode is the caption's
 * first word ("Ranska,", "Kemia.3"), homework has course codes ("vRAB2_5LV"),
 * so only subject names line up. Week of Mon 11 Mar 2030.
 */
const student = { studentNumber: "1111", name: "Lapsi Yksi" };
const lesson = (date: string, start: string, end: string, subject: string, subjectCode: string, teacher = "Opettaja A", room: string | null = "R1") => ({
  date, dayOfWeek: new Date(date + "T12:00:00Z").getUTCDay(), start, end, subject, subjectCode, teacher, teacherCode: "OA", groupId: 1, room,
});
const hw = (date: string, subject: string, subjectCode: string, homework: string) => ({ date, subject, subjectCode, homework, teacher: "Opettaja A", teacherCode: "OA" });

const lessons = [
  lesson("2030-03-11", "10:00", "10:45", "Maantieto", "Maantieto"),
  lesson("2030-03-11", "12:00", "12:45", "Kemia", "Kemia.3", "Opettaja A, Opettaja B", "R1, R2"),
  lesson("2030-03-11", "13:00", "13:45", "Draama", "Draama", "Opettaja C", null),
  lesson("2030-03-12", "09:00", "09:45", "Historia", "Historia"),
  lesson("2030-03-12", "09:45", "10:30", "Historia", "Historia"),
  lesson("2030-03-12", "11:00", "11:45", "Kemia", "Kemia.3"),
  lesson("2030-03-13", "08:00", "08:45", "Kemia", "Kemia.3"),
  lesson("2030-03-14", "09:00", "09:45", "Ranska, B2", "Ranska,", "Opettaja D"),
  lesson("2030-03-15", "09:00", "09:45", "Kemia", "Kemia.3"),
];
const homework = [
  hw("2030-03-07", "Ranska, B2", "vRAB2_5LV", "Lue sivu 5"),
  hw("2030-03-06", "Kemia", "KE_5LV", "Kirja s. 12–13"),
  hw("2030-03-05", "Historia", "HI_5LV", "Vihko s. 8"),
  hw("2030-03-05", "Kemia", "KE_5LV", "Kirja s. 11"),
  hw("2030-03-04", "Maantieto", "GE_5LV", "Lue luku 3 kahdesti"),
  hw("2030-02-28", "Ranska, B2", "vRAB2_5LV", "Sanat s. 4"),
];

const runner: Runner = async (args) => {
  const cmd = args.join(" ");
  if (cmd === "summary") {
    return {
      students: [{
        student,
        summary: { today: "2030-03-10", tomorrow: "2030-03-11", todaySchedule: [], tomorrowSchedule: [], upcomingExams: [], homework: [], messages: [], unreadMessages: 0 },
      }],
    };
  }
  if (cmd.startsWith("homework")) return { students: [{ student, homework }] };
  if (cmd === "schedule week") return { when: "week", students: [{ student, lessons }] };
  if (cmd === "schedule next-week") return { when: "next-week", students: [{ student, lessons: [] }] };
  if (cmd.startsWith("grades")) return { students: [{ student, grades: [] }] };
  throw new Error(cmd);
};

const cfg = { cutoffMinutes: 16 * 60, daysAhead: 1, lookbackDays: 7 };
const highlighted = (today: string, minutes: number, data: Awaited<ReturnType<typeof fetchAll>>) =>
  buildBriefing(data.students[0], today, minutes, cfg).days[0].lessons.map((l) => [l.subject, l.homework.map((h) => h.homework)]);

describe("realistic Wilma data", () => {
  it("matches homework by subject name despite unrelated codes", async () => {
    const data = await fetchAll(runner, { includeNextWeek: true });
    // Sunday evening -> Monday. Kemia: only the newest item (5 Mar was due by 6 Mar).
    expect(highlighted("2030-03-10", 17 * 60, data)).toEqual([
      ["Maantieto", ["Lue luku 3 kahdesti"]],
      ["Kemia", ["Kirja s. 12–13"]],
      ["Draama", []],
    ]);
  });

  it("shows homework once on a double lesson and nothing after a lesson in between", async () => {
    const data = await fetchAll(runner, { includeNextWeek: false });
    expect(highlighted("2030-03-12", 8 * 60, data)).toEqual([
      ["Historia", ["Vihko s. 8"]],
      ["Historia", []],
      ["Kemia", []], // Kemia had a lesson on Monday
    ]);
  });

  it("finds a comma-named subject's homework a week back", async () => {
    const data = await fetchAll(runner, { includeNextWeek: false });
    expect(highlighted("2030-03-13", 17 * 60, data)).toEqual([["Ranska, B2", ["Lue sivu 5"]]]);
  });

  it("lists homework until the subject's next lesson", async () => {
    const data = await fetchAll(runner, { includeNextWeek: false });
    const ranska = (today: string, minutes: number) =>
      buildBriefing(data.students[0], today, minutes, cfg).homework.filter((h) => h.subject === "Ranska, B2").map((h) => [h.homework, h.due]);
    // Given Thu 7 Mar, next French lesson Thu 14 Mar.
    expect(ranska("2030-03-11", 17 * 60)).toEqual([["Lue sivu 5", "2030-03-14"]]);
    expect(ranska("2030-03-14", 8 * 60)).toEqual([["Lue sivu 5", "2030-03-14"]]);
    expect(ranska("2030-03-14", 17 * 60)).toEqual([]);
    // Kemia's older items were due at its Monday lesson.
    expect(buildBriefing(data.students[0], "2030-03-12", 8 * 60, cfg).homework.some((h) => h.subject === "Kemia")).toBe(false);
  });

  it("renders several rooms and missing rooms when rooms are shown", async () => {
    const data = await fetchAll(runner, { includeNextWeek: false });
    const briefing = buildBriefing(data.students[0], "2030-03-10", 17 * 60, cfg);
    const md = renderMarkdown(briefing, "fi", { showRooms: true });
    expect(md).toContain("**12:00–12:45** Kemia · R1, R2");
    expect(md).toMatch(/\*\*13:00–13:45\*\* Draama\s*$/m); // no room
    // Hidden by default.
    expect(renderMarkdown(briefing, "fi")).toMatch(/\*\*12:00–12:45\*\* Kemia\s*$/m);
  });
});
