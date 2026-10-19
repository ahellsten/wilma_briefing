import { describe, expect, it } from "vitest";
import { buildBriefing } from "../src/briefing.js";
import { briefingState, dayLabel, formatDate, renderMarkdown, renderNotification } from "../src/render.js";
import { loadData } from "./helpers.js";

const cfg = { cutoffMinutes: 16 * 60, daysAhead: 1, lookbackDays: 7, newGradeDays: 7 };
const WED = "2026-10-14";

describe("dates", () => {
  it("formats in Finnish and English", () => {
    expect(formatDate("2026-10-15", "fi")).toBe("to 15.10.");
    expect(formatDate("2026-10-15", "en")).toBe("Thu 15 Oct");
    expect(dayLabel("2026-10-15", WED, "fi")).toBe("huomenna to 15.10.");
    expect(dayLabel(WED, WED, "en")).toBe("today Wed 14 Oct");
    expect(dayLabel("2026-10-19", WED, "fi")).toBe("ma 19.10.");
  });
});

describe("renderMarkdown", () => {
  it("renders lessons, homework, exams and unread messages", async () => {
    const data = await loadData();
    const aino = buildBriefing(data.students[0], WED, 17 * 60, cfg);
    const fi = renderMarkdown(aino, "fi");
    expect(fi).toContain("### Aino Esimerkki – huomenna to 15.10. · 8:15–14:00");
    expect(fi).toMatch(/^\*\*8:15–9:00\*\* Fysiikka {2}$/m); // rooms hidden by default
    expect(renderMarkdown(aino, "fi", { showRooms: true })).toContain("**8:15–9:00** Fysiikka · A203");
    expect(fi).toContain(
      '<ha-alert alert-type="success">📚 3 läksyä' +
        "<br>• **Biologia** – huomiselle: Lue kappale 4 *(annettu ti 13.10.)*" +
        "<br>• **Englanti** – huomiselle: Unit 3 sanat *(annettu ke 14.10.)*" +
        "<br>• **Fysiikka** – huomiselle: s. 45 teht. 1–5 *(annettu ti 13.10.)*</ha-alert>"
    );
    expect(fi).not.toContain("> 📚");
    expect(fi.indexOf("📚")).toBeLessThan(fi.indexOf("Tulevat kokeet"));
    expect(fi).toContain('<ha-alert alert-type="warning">Koe 12:00 – Biologia: Kappaleet 1–4</ha-alert>');
    expect(fi).toContain("**Tulevat kokeet:** ke 21.10. Fysiikka");
    expect(fi).toContain("✉️ 1 lukematon viesti<br>• Retkipäivä perjantaina – Virtanen Ville");
    expect(briefingState(aino, "fi")).toBe("Huomenna to 15.10.");

    const en = renderMarkdown(aino, "en");
    expect(en).toContain("📚 3 homework<br>• **Biologia** – for tomorrow: Lue kappale 4 *(given Tue 13 Oct)*");
    expect(en).toContain("1 unread message");
  });

  it("labels homework due later by date only", async () => {
    const data = await loadData();
    const aino = buildBriefing(data.students[0], "2026-10-13", 8 * 60, cfg);
    const md = renderMarkdown(aino, "fi");
    expect(md).toContain("**Englanti** – huomiselle: Workbook p. 20");
    expect(md).toContain("**Biologia** – 15.10. mennessä: Lue kappale 4");
    expect(md).toContain("**Fysiikka** – tälle päivälle: s. 40 teht. 1–3");
    expect(renderMarkdown(aino, "en")).toContain("**Biologia** – due 15 Oct: Lue kappale 4");
  });

  it("uses day headings when showing several days", async () => {
    const data = await loadData();
    const aino = buildBriefing(data.students[0], WED, 17 * 60, { ...cfg, daysAhead: 2 });
    const md = renderMarkdown(aino, "fi");
    expect(md).toContain("#### Huomenna to 15.10. · 8:15–14:00");
    expect(md).toContain("#### Pe 16.10. · 8:15–9:00");
  });

  it("escapes Markdown in Wilma text", async () => {
    const data = await loadData();
    data.students[0].homework[1].homework = "Tee *kaikki* <b>tehtävät</b>";
    const md = renderMarkdown(buildBriefing(data.students[0], WED, 17 * 60, cfg), "fi");
    expect(md).toContain("Tee \\*kaikki\\* \\<b\\>tehtävät\\</b\\>");
  });
});

describe("renderNotification", () => {
  it("summarises every child for the target day", async () => {
    const data = await loadData();
    const list = data.students.map((s) => buildBriefing(s, WED, 17 * 60, cfg));
    const n = renderNotification(list, "2026-10-15", WED, "fi");
    expect(n.title).toBe("Wilma: huomenna to 15.10.");
    expect(n.message).toBe("Aino Esimerkki: 8:15–14:00 · 📚 läksyt: Fysiikka, Englanti, Biologia · 📝 koe: Biologia · ✉️ 1");
  });
});
