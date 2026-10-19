import { describe, expect, it } from "vitest";
import { buildBriefing, sameSubject, selectTargetDays } from "../src/briefing.js";
import { applyNameDisplay, fetchAll, WilmaError } from "../src/wilma.js";
import { fixtureRunner, loadData } from "./helpers.js";

const cfg = { cutoffMinutes: 16 * 60, daysAhead: 1, lookbackDays: 7 };
const WED = "2026-10-14";

describe("selectTargetDays", () => {
  const dates = ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19"];

  it("shows today before the cutoff on a school day", () => {
    expect(selectTargetDays(dates, WED, 10 * 60, cfg)).toEqual({ mode: "today", dates: [WED] });
  });

  it("shows the next school day after the cutoff", () => {
    expect(selectTargetDays(dates, WED, 16 * 60, cfg)).toEqual({ mode: "next", dates: ["2026-10-15"] });
  });

  it("goes from Friday evening to Monday", () => {
    expect(selectTargetDays(dates, "2026-10-16", 17 * 60, cfg).dates).toEqual(["2026-10-19"]);
  });

  it("shows the next school day before the cutoff on a weekend", () => {
    expect(selectTargetDays(dates, "2026-10-17", 9 * 60, cfg)).toEqual({ mode: "next", dates: ["2026-10-19"] });
  });

  it("skips days without lessons (holidays)", () => {
    expect(selectTargetDays(["2026-10-14", "2026-10-16"], WED, 17 * 60, cfg).dates).toEqual(["2026-10-16"]);
  });

  it("returns several days with daysAhead", () => {
    expect(selectTargetDays(dates, WED, 17 * 60, { ...cfg, daysAhead: 3 }).dates).toEqual(["2026-10-15", "2026-10-16", "2026-10-19"]);
  });

  it("returns nothing when no lessons are known", () => {
    expect(selectTargetDays([], WED, 17 * 60, cfg).dates).toEqual([]);
  });
});

describe("sameSubject", () => {
  it("matches names, ignoring case, parentheses and punctuation", () => {
    expect(sameSubject({ subject: "Fysiikka", subjectCode: "" }, { subject: "fysiikka", subjectCode: "" })).toBe(true);
    expect(sameSubject({ subject: "Englanti, A1", subjectCode: "" }, { subject: "Englanti", subjectCode: "" })).toBe(true);
    expect(sameSubject({ subject: "Englanti A1", subjectCode: "" }, { subject: "Englanti (A1)", subjectCode: "" })).toBe(true);
    expect(sameSubject({ subject: "Biologia", subjectCode: "BI_7" }, { subject: "biologia", subjectCode: "" })).toBe(true);
  });

  it("falls back to codes only when a name is missing", () => {
    expect(sameSubject({ subject: "", subjectCode: "FY_7" }, { subject: "Fysiikka", subjectCode: "fy_7" })).toBe(true);
    expect(sameSubject({ subject: "", subjectCode: "ENA_7" }, { subject: "Englanti", subjectCode: "ENA7" })).toBe(true);
  });

  it("keeps different subjects apart, even with a shared class code", () => {
    expect(sameSubject({ subject: "Kemia", subjectCode: "5C" }, { subject: "Historia", subjectCode: "5C" })).toBe(false);
    expect(sameSubject({ subject: "Kotitalous", subjectCode: "" }, { subject: "Koti", subjectCode: "" })).toBe(false);
  });
});

describe("buildBriefing", () => {
  it("attaches homework due at tomorrow's lessons", async () => {
    const data = await loadData();
    const aino = buildBriefing(data.students[0], WED, 17 * 60, cfg);
    expect(aino.mode).toBe("next");
    expect(aino.days.map((d) => d.date)).toEqual(["2026-10-15"]);

    const [ma1, ma2, en, bi] = aino.days[0].lessons;
    // Monday's physics homework was due Tuesday (an earlier physics lesson), so only Tuesday's counts.
    expect(ma1.homework.map((h) => h.homework)).toEqual(["s. 45 teht. 1–5"]);
    // Second half of the double lesson repeats nothing.
    expect(ma2.homework).toEqual([]);
    // Monday's English homework was due Wednesday.
    expect(en.homework.map((h) => h.homework)).toEqual(["Unit 3 sanat"]);
    // Matched by name (homework had no code).
    expect(bi.homework.map((h) => h.homework)).toEqual(["Lue kappale 4"]);
    expect(aino.homework.map((h) => [h.subject, h.due])).toEqual([
      ["Biologia", "2026-10-15"],
      ["Englanti", "2026-10-15"],
      ["Fysiikka", "2026-10-15"],
    ]);

    expect(aino.days[0].firstStart).toBe("08:15");
    expect(aino.days[0].lastEnd).toBe("14:00");
    expect(aino.days[0].exams.map((e) => e.examId)).toEqual([500]);
    expect(aino.nextExam?.examId).toBe(500);
    expect(aino.unreadCount).toBe(1);
    expect(aino.unreadMessages.map((m) => m.wilmaId)).toEqual([9001]);
  });

  it("shows today's lessons before the cutoff without today's own homework", async () => {
    const data = await loadData();
    const aino = buildBriefing(data.students[0], WED, 8 * 60, cfg);
    expect(aino.mode).toBe("today");
    const english = aino.days[0].lessons.find((l) => l.subject === "Englanti")!;
    // Given on Monday, due today; today's own homework is for the next lesson.
    expect(english.homework.map((h) => h.homework)).toEqual(["Workbook p. 20"]);
    // Today's own homework is listed too, due at the next lesson.
    expect(aino.homework.filter((h) => h.subject === "Englanti").map((h) => [h.homework, h.due])).toEqual([
      ["Workbook p. 20", WED],
      ["Unit 3 sanat", "2026-10-15"],
    ]);
  });

  it("lets each child have its own next school day", async () => {
    const data = await loadData();
    const eero = buildBriefing(data.students[1], WED, 17 * 60, cfg);
    expect(eero.days.map((d) => d.date)).toEqual(["2026-10-16"]);
    // lessonNotes is not used by the briefing, so only appointments counts.
    expect(eero.warnings).toEqual(["unavailable: appointments"]);
  });
});

describe("fetchAll", () => {
  it("merges and dedupes lessons and homework", async () => {
    const data = await loadData();
    const aino = data.students[0];
    expect(aino.lessons.filter((l) => l.date === "2026-10-15")).toHaveLength(4);
    expect(aino.homework).toHaveLength(5);
    expect(aino.lessons.at(-1)?.date).toBe("2026-10-19");
  });

  it("lists a message in both inbox and appointments once", async () => {
    const data = await fetchAll(async (args) => {
      const out = await fixtureRunner(args);
      if (args[0] !== "summary") return out;
      const summary = structuredClone(out) as any;
      const s = summary.students[0].summary;
      s.messages.push({ ...s.messages[0], folder: "appointments" });
      s.unreadMessages += 1;
      return summary;
    }, { includeNextWeek: false });
    expect(data.students[0].unreadMessages.map((m) => m.wilmaId)).toEqual([9001]);
    expect(data.students[0].unreadCount).toBe(1);
  });

  it("keeps going when an optional call fails", async () => {
    const data = await fetchAll(async (args) => {
      if (args[0] === "homework") throw new WilmaError("network", "timeout");
      return fixtureRunner(args);
    }, { includeNextWeek: false });
    expect(data.students).toHaveLength(2);
    expect(data.warnings[0]).toContain("homework");
  });

  it("fails on auth errors", async () => {
    await expect(
      fetchAll(async (args) => {
        if (args[0] === "schedule") throw new WilmaError("login_failed", "bad password");
        return fixtureRunner(args);
      }, { includeNextWeek: false })
    ).rejects.toThrow("bad password");
  });
});

describe("applyNameDisplay", () => {
  const result = (...names: string[]) => ({
    fetchedAt: new Date(0),
    warnings: [],
    students: names.map((name, i) => ({
      student: { studentNumber: String(i), name },
      today: WED, lessons: [], homework: [], exams: [], unreadMessages: [], unreadCount: 0, warnings: [],
    })),
  });
  const names = (r: ReturnType<typeof result>) => r.students.map((s) => s.student.name);

  it("shows first names by default and full names on request", () => {
    expect(names(applyNameDisplay(result("Aino Esimerkki", "Eero Esimerkki"), "first"))).toEqual(["Aino", "Eero"]);
    expect(names(applyNameDisplay(result("Aino Esimerkki"), "full"))).toEqual(["Aino Esimerkki"]);
  });

  it("keeps full names when siblings share a first name", () => {
    expect(names(applyNameDisplay(result("Aino Esimerkki", "Aino Malli", "Eero Esimerkki"), "first"))).toEqual([
      "Aino Esimerkki",
      "Aino Malli",
      "Eero",
    ]);
  });
});
