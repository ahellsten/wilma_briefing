import { describe, expect, it } from "vitest";
import { buildBriefing } from "../src/briefing.js";
import { markNotified, trackGrades, withSeen } from "../src/grades.js";
import { gradeText, HTML_ITEM_GAP, renderHtml, renderMarkdown, renderNotification } from "../src/render.js";
import { loadData } from "./helpers.js";

const cfg = { cutoffMinutes: 16 * 60, daysAhead: 1, lookbackDays: 7, newGradeDays: 7 };
const WED = "2026-10-14";

describe("trackGrades", () => {
  it("seeds a student's first fetch with exam dates, then marks new grades as seen today", async () => {
    const data = await loadData();
    const first = trackGrades({}, data.students, WED);
    expect(first["1001"]["701"]).toEqual({ seen: "2026-10-12", notified: true });
    expect(first["1002"]).toEqual({});

    data.students[0].grades!.unshift({ ...data.students[0].grades![0], examId: 703, date: "2026-10-05" });
    const second = trackGrades(first, data.students, "2026-10-16");
    expect(second["1001"]["703"]).toEqual({ seen: "2026-10-16", notified: false });
    expect(second["1001"]["701"]).toEqual(first["1001"]["701"]);

    // A failed grades call keeps what was known.
    data.students[0].grades = undefined;
    expect(trackGrades(second, data.students, "2026-10-17")["1001"]).toEqual(second["1001"]);
  });

  it("forgets grades that dropped out of the list", async () => {
    const data = await loadData();
    const seen = trackGrades({}, data.students, WED);
    data.students[0].grades = data.students[0].grades!.slice(0, 1);
    expect(Object.keys(trackGrades(seen, data.students, WED)["1001"])).toEqual(["701"]);
  });
});

describe("new grades", () => {
  const setup = async () => {
    const data = await loadData();
    let seen = trackGrades({}, data.students, "2026-10-01");
    // 701 and 702 were entered after the first fetch.
    data.students[0].grades![0].examId = 801;
    data.students[0].grades![1].examId = 802;
    seen = trackGrades(seen, data.students, "2026-10-13");
    return { data, seen };
  };

  it("lists grades seen in the last 7 days on the card", async () => {
    const { data, seen } = await setup();
    const aino = buildBriefing(withSeen(data.students, seen)[0], WED, 17 * 60, cfg);
    expect(aino.newGrades.map((g) => g.examId)).toEqual([801, 802]);
    const fi = renderMarkdown(aino, "fi");
    expect(fi).toContain(
      '<ha-alert alert-type="info">**🎓 2 uutta arvosanaa**<br>• **Englanti** – Sanakoe: 9½ *(koe 12.10.)*<br>• **Kuvataide**: Hienoa työtä \\<3 *(koe 9.10.)*</ha-alert>'
    );
    expect(fi.indexOf("🎓")).toBeLessThan(fi.indexOf("Tulevat kokeet"));
    expect(renderMarkdown(aino, "en")).toContain("**🎓 2 new grades**<br>• **Englanti** – Sanakoe: 9½ *(exam 12 Oct)*");

    // Seen on 13 Oct: still new on the 19th, gone on the 20th.
    expect(buildBriefing(withSeen(data.students, seen)[0], "2026-10-19", 8 * 60, cfg).newGrades).toHaveLength(2);
    expect(buildBriefing(withSeen(data.students, seen)[0], "2026-10-20", 8 * 60, cfg).newGrades).toHaveLength(0);
    // A longer period keeps them.
    expect(buildBriefing(withSeen(data.students, seen)[0], "2026-10-20", 8 * 60, { ...cfg, newGradeDays: 14 }).newGrades).toHaveLength(2);
  });

  it("puts each new grade in the notification once", async () => {
    const { data, seen } = await setup();
    const list = (s: typeof seen) => withSeen(data.students, s).map((x) => buildBriefing(x, WED, 17 * 60, cfg));
    const first = renderNotification(list(seen), "2026-10-15", WED, "fi").message;
    expect(first).toContain(" · 🎓 Englanti 9½ · 🎓 Kuvataide Hienoa työtä <3 · ✉️ 1");

    const after = markNotified(seen, [
      { studentNumber: "1001", examId: 801 },
      { studentNumber: "1001", examId: 802 },
    ]);
    expect(renderNotification(list(after), "2026-10-15", WED, "fi").message).not.toContain("🎓");
    expect(renderMarkdown(list(after)[0], "fi")).toContain("🎓 2 uutta arvosanaa");
  });

  it("formats grades", () => {
    const g = { examId: 1, date: WED, name: "", subject: "", subjectCode: "", info: null, teacher: "" };
    expect(gradeText({ ...g, grade: "9 1/2", verbalGrade: null })).toBe("9½");
    expect(gradeText({ ...g, grade: "8/10", verbalGrade: null })).toBe("8/10");
    expect(gradeText({ ...g, grade: "7-", verbalGrade: "ok" })).toBe("7-");
    expect(gradeText({ ...g, grade: null, verbalGrade: "x".repeat(120) })).toHaveLength(100);
  });
});

describe("renderHtml", () => {
  it("renders the card with basic tags only", async () => {
    const data = await loadData();
    data.students[0].homework[1].homework = "Tee *kaikki* <b>tehtävät</b> & muut";
    const html = renderHtml(buildBriefing(data.students[0], WED, 17 * 60, cfg), "fi", { showRooms: true });
    expect(html).toMatch(/^<div style="text-align:start"><big><b>Aino Esimerkki – huomenna to 15\.10\. · 8:15–14:00<\/b><\/big><br><br>/);
    expect(html).toMatch(/<\/div>$/);
    expect(html).toContain("<b>📝 Koe 12:00 – Biologia: Kappaleet 1–4</b>");
    expect(html).toContain("<b>8:15–9:00</b> Fysiikka · A203<br><b>9:00–9:45</b>");
    const gap = HTML_ITEM_GAP;
    expect(html).toContain(`<b>📚 3 läksyä</b>${gap}<br>• <b>Biologia</b> – <b>huomiselle</b>: Lue kappale 4 <i>(annettu ti 13.10.)</i>${gap}<br>• <b>Englanti</b>`);
    expect(html).toContain("Tee *kaikki* &lt;b&gt;tehtävät&lt;/b&gt; &amp; muut");
    expect(html).toContain(`<b>📝 Tulevat kokeet</b>${gap}<br>• <b>Fysiikka</b> – <b>21.10.</b>: Luvut 1–3`);
    expect(html).toContain(`<b>✉️ 1 lukematon viesti</b>${gap}<br>• Retkipäivä perjantaina – Virtanen Ville`);
    expect(html).not.toMatch(/ha-alert|\*\*|\n/);
    expect(html.replace(/<\/?(big|small|b|i|br)>|<div style="text-align:start">|<\/div>/g, "")).not.toMatch(/<[a-z]/);
  });

  it("aligns the HTML card as configured", async () => {
    const data = await loadData();
    const b = buildBriefing(data.students[0], WED, 17 * 60, cfg);
    expect(renderHtml(b, "fi", { htmlAlign: "center" })).toMatch(/^<div style="text-align:center">/);
    expect(renderHtml(b, "fi", { htmlAlign: "right" })).toMatch(/^<div style="text-align:end">/);
  });

  it("pads the HTML card to the configured number of lines", async () => {
    const data = await loadData();
    const b = buildBriefing(data.students[0], WED, 17 * 60, cfg);
    const lines = (html: string) => html.split("<br>").length;
    const plain = renderHtml(b, "fi");
    expect(plain).not.toContain("&#8203;");
    const padded = renderHtml(b, "fi", { htmlMinLines: 40 });
    expect(lines(padded)).toBe(40);
    expect(padded).toMatch(/(<br>)+&#8203;<\/div>$/);
    // Already long enough: unchanged.
    expect(renderHtml(b, "fi", { htmlMinLines: 3 })).toBe(plain);
  });
});
