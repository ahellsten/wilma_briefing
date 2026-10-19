import type { Briefing, BriefingDay } from "./briefing.js";
import { addDays, weekday } from "./dates.js";
import type { Grade } from "./wilma.js";

export type Language = "fi" | "en";

export interface RenderOptions {
  /** Show the classroom after each lesson. */
  showRooms?: boolean;
}

const STRINGS = {
  fi: {
    weekdays: ["su", "ma", "ti", "ke", "to", "pe", "la"],
    months: [],
    today: "tänään",
    tomorrow: "huomenna",
    noLessons: "Ei tunteja tulossa lähipäivinä.",
    givenOn: "annettu",
    exam: "Koe",
    upcoming: "Tulevat kokeet",
    unread: (n: number) => (n === 1 ? "1 lukematon viesti" : `${n} lukematonta viestiä`),
    homework: "läksyt",
    homeworkCount: (n: number) => (n === 1 ? "1 läksy" : `${n} läksyä`),
    dueToday: "tälle päivälle",
    dueTomorrow: "huomiselle",
    dueOn: (date: string) => `${date} mennessä`,
    dueNextLesson: "seuraavalle tunnille",
    newGrades: (n: number) => (n === 1 ? "1 uusi arvosana" : `${n} uutta arvosanaa`),
    examOn: "koe",
    warning: "Osa tiedoista puuttuu",
    title: "Wilma",
  },
  en: {
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    today: "today",
    tomorrow: "tomorrow",
    noLessons: "No lessons in the coming days.",
    givenOn: "given",
    exam: "Exam",
    upcoming: "Upcoming exams",
    unread: (n: number) => (n === 1 ? "1 unread message" : `${n} unread messages`),
    homework: "homework",
    homeworkCount: (n: number) => `${n} homework`,
    dueToday: "for today",
    dueTomorrow: "for tomorrow",
    dueOn: (date: string) => `due ${date}`,
    dueNextLesson: "for the next lesson",
    newGrades: (n: number) => (n === 1 ? "1 new grade" : `${n} new grades`),
    examOn: "exam",
    warning: "Some data is missing",
    title: "Wilma",
  },
} as const;

/** Finnish "ke 15.10.", English "Wed 15 Oct". */
export function formatDate(iso: string, lang: Language): string {
  const s = STRINGS[lang];
  const [, m, d] = iso.split("-").map(Number);
  const wd = s.weekdays[weekday(iso)];
  return lang === "fi" ? `${wd} ${d}.${m}.` : `${wd} ${d} ${s.months[m - 1]}`;
}

/** Finnish "15.10.", English "15 Oct". */
function shortDate(iso: string, lang: Language): string {
  const [, m, d] = iso.split("-").map(Number);
  return lang === "fi" ? `${d}.${m}.` : `${d} ${STRINGS.en.months[m - 1]}`;
}

/** "huomenna ke 15.10." / "tänään ke 15.10." / "ma 20.10." */
export function dayLabel(date: string, today: string, lang: Language): string {
  const s = STRINGS[lang];
  const prefix = date === today ? s.today : date === addDays(today, 1) ? s.tomorrow : "";
  return prefix ? `${prefix} ${formatDate(date, lang)}` : formatDate(date, lang);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Strip a leading zero for compact times: "08:15" -> "8:15". */
function t(time: string | null): string {
  return (time ?? "").replace(/^0(\d)/, "$1");
}

/** State of the briefing sensor (max 255 chars in HA). */
export function briefingState(b: Briefing, lang: Language): string {
  const first = b.days[0];
  return first ? capitalize(dayLabel(first.date, b.today, lang)) : "–";
}

/** "huomiselle" / "23.10. mennessä": no weekday, the date is enough here. */
function dueLabel(due: string | null, today: string, lang: Language): string {
  const s = STRINGS[lang];
  if (!due) return s.dueNextLesson;
  if (due === today) return s.dueToday;
  if (due === addDays(today, 1)) return s.dueTomorrow;
  return s.dueOn(shortDate(due, lang));
}

/** "9 1/2" -> "9½"; a verbal grade when there is no number. */
export function gradeText(g: Grade): string {
  const grade = (g.grade ?? "").trim().replace(/^(\d+)\s*1\/2$/, "$1½");
  if (grade) return grade;
  const verbal = (g.verbalGrade ?? "").replace(/\s+/g, " ").trim();
  return verbal.length > 100 ? `${verbal.slice(0, 99)}…` : verbal;
}

/*
 * The card is built once as blocks and then written as Markdown (HA's
 * Markdown card) or as simple HTML (e.g. the Android template widget).
 */

/** Our own text (a string), Wilma text ({ w }), bold or italic. */
type Span = string | { w: string } | { b: Span[] } | { i: Span[] };

type Block =
  | { kind: "title" | "heading" | "text"; spans: Span[] }
  | { kind: "lines"; lines: Span[][] }
  | { kind: "box"; type: "info" | "success" | "warning" | "error"; icon?: string; title: Span[]; items: Span[][] };

const w = (text: string): Span => ({ w: text });

function dayBlocks(day: BriefingDay, b: Briefing, lang: Language, opts: RenderOptions, withHeading: boolean): Block[] {
  const s = STRINGS[lang];
  const out: Block[] = [];
  const span = day.firstStart ? ` · ${t(day.firstStart)}–${t(day.lastEnd)}` : "";
  if (withHeading) out.push({ kind: "heading", spans: [capitalize(dayLabel(day.date, b.today, lang)) + span] });
  for (const exam of day.exams) {
    const time = exam.time ? ` ${t(exam.time)}` : "";
    const title: Span[] = [`${s.exam}${time} – `, w(exam.subject || exam.name)];
    if (exam.topic) title.push(": ", w(exam.topic));
    out.push({ kind: "box", type: "warning", icon: "📝", title, items: [] });
  }
  out.push({
    kind: "lines",
    lines: day.lessons.map((l) => [{ b: [`${t(l.start)}–${t(l.end)}`] }, " ", w(l.subject), ...(opts.showRooms && l.room ? [" · ", w(l.room)] : [])]),
  });
  return out;
}

function blocks(b: Briefing, lang: Language, opts: RenderOptions): Block[] {
  const s = STRINGS[lang];
  const out: Block[] = [];
  const first = b.days[0];
  const span = first?.firstStart && b.days.length === 1 ? ` · ${t(first.firstStart)}–${t(first.lastEnd)}` : "";
  out.push({ kind: "title", spans: [w(b.student.name), ` – ${first ? dayLabel(first.date, b.today, lang) : "–"}${span}`] });

  if (!b.days.length) out.push({ kind: "text", spans: [s.noLessons] });
  for (const day of b.days) out.push(...dayBlocks(day, b, lang, opts, b.days.length > 1));

  if (b.homework.length) {
    out.push({
      kind: "box",
      type: "success",
      title: [`📚 ${s.homeworkCount(b.homework.length)}`],
      items: b.homework.map((h) => [
        { b: [w(h.subject)] },
        ` – ${dueLabel(h.due, b.today, lang)}: `,
        w(h.homework),
        " ",
        { i: [`(${s.givenOn} ${formatDate(h.date, lang)})`] },
      ]),
    });
  }

  if (b.newGrades.length) {
    out.push({
      kind: "box",
      type: "info",
      title: [`🎓 ${s.newGrades(b.newGrades.length)}`],
      items: b.newGrades.map((g) => [
        { b: [w(g.subject)] },
        ...(g.name ? [" – ", w(g.name)] : []),
        ": ",
        w(gradeText(g)),
        " ",
        { i: [`(${s.examOn} ${shortDate(g.date, lang)})`] },
      ]),
    });
  }

  const shown = new Set(b.days.flatMap((d) => d.exams.map((e) => e.examId)));
  const later = b.upcomingExams.filter((e) => !shown.has(e.examId)).slice(0, 3);
  if (later.length) {
    const list = later.flatMap((e, i): Span[] => [i ? ", " : "", `${formatDate(e.date, lang)} `, w(e.subject || e.name)]);
    out.push({ kind: "text", spans: [{ b: [`${s.upcoming}:`] }, " ", ...list] });
  }

  if (b.unreadCount > 0) {
    out.push({
      kind: "box",
      type: "info",
      title: [`✉️ ${s.unread(b.unreadCount)}`],
      items: b.unreadMessages.slice(0, 5).map((m) => [w(m.subject), ...(m.senderName ? [" – ", w(m.senderName)] : [])]),
    });
  }
  if (b.warnings.length) out.push({ kind: "box", type: "error", icon: "⚠️", title: [s.warning], items: [] });
  return out;
}

/** Keep Wilma text from breaking the card's Markdown. */
function md(text: string): string {
  return text.replace(/\s+/g, " ").replace(/([\\`*_[\]<>|#])/g, "\\$1").trim();
}

function spansMd(spans: Span[]): string {
  return spans
    .map((x) => (typeof x === "string" ? x : "w" in x ? md(x.w) : "b" in x ? `**${spansMd(x.b)}**` : `*${spansMd(x.i)}*`))
    .join("");
}

/** The card body for one child; the dashboard shows it with a Markdown card. */
export function renderMarkdown(b: Briefing, lang: Language, opts: RenderOptions = {}): string {
  return blocks(b, lang, opts)
    .map((block) => {
      switch (block.kind) {
        case "title":
          return `### ${spansMd(block.spans)}`;
        case "heading":
          return `#### ${spansMd(block.spans)}`;
        case "text":
          return spansMd(block.spans);
        case "lines":
          return block.lines.map((l) => `${spansMd(l)}  `).join("\n");
        case "box":
          return `<ha-alert alert-type="${block.type}">${spansMd(block.title)}${block.items.map((i) => `<br>• ${spansMd(i)}`).join("")}</ha-alert>`;
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function spansHtml(spans: Span[]): string {
  return spans
    .map((x) =>
      typeof x === "string"
        ? esc(x)
        : "w" in x
          ? esc(x.w.replace(/\s+/g, " ").trim())
          : "b" in x
            ? `<b>${spansHtml(x.b)}</b>`
            : `<i>${spansHtml(x.i)}</i>`
    )
    .join("");
}

/**
 * The same card as simple HTML: only <b>, <i> and <br>, which widgets with
 * basic HTML support (Android's Html.fromHtml) understand. Boxes become a
 * bold title line with the items under it.
 */
export function renderHtml(b: Briefing, lang: Language, opts: RenderOptions = {}): string {
  return blocks(b, lang, opts)
    .map((block) => {
      switch (block.kind) {
        case "title":
        case "heading":
          return `<b>${spansHtml(block.spans)}</b>`;
        case "text":
          return spansHtml(block.spans);
        case "lines":
          return block.lines.map(spansHtml).join("<br>");
        case "box":
          return `<b>${block.icon ? `${block.icon} ` : ""}${spansHtml(block.title)}</b>${block.items.map((i) => `<br>• ${spansHtml(i)}`).join("")}`;
      }
    })
    .filter(Boolean)
    .join("<br><br>");
}

/** New grades the notification hasn't mentioned yet. */
export function unnotifiedGrades(b: Briefing): Grade[] {
  return b.newGrades.filter((g) => !g.notified);
}

function gradeNews(b: Briefing): string[] {
  return unnotifiedGrades(b).map((g) => `🎓 ${g.subject} ${gradeText(g)}`);
}

/** One line per child for the daily push notification (first target day only). */
export function notificationLine(b: Briefing, lang: Language): string | null {
  const s = STRINGS[lang];
  const day = b.days[0];
  if (!day) return null;
  const parts = [`${t(day.firstStart)}–${t(day.lastEnd)}`];
  const hw = [...new Set(day.lessons.filter((l) => l.homework.length).map((l) => l.subject))];
  if (hw.length) parts.push(`📚 ${s.homework}: ${hw.join(", ")}`);
  for (const e of day.exams) parts.push(`📝 ${s.exam.toLowerCase()}: ${e.subject || e.name}`);
  parts.push(...gradeNews(b));
  if (b.unreadCount) parts.push(`✉️ ${b.unreadCount}`);
  return `${b.student.name}: ${parts.join(" · ")}`;
}

export function renderNotification(briefings: Briefing[], targetDate: string, today: string, lang: Language) {
  const lines = briefings
    .filter((b) => b.days[0]?.date === targetDate)
    .map((b) => notificationLine(b, lang))
    .filter((l): l is string => l !== null);
  for (const b of briefings.filter((b) => b.days[0]?.date !== targetDate)) {
    const parts = [...gradeNews(b), ...(b.unreadCount > 0 ? [`✉️ ${STRINGS[lang].unread(b.unreadCount)}`] : [])];
    if (parts.length) lines.push(`${b.student.name}: ${parts.join(" · ")}`);
  }
  return {
    title: `${STRINGS[lang].title}: ${dayLabel(targetDate, today, lang)}`,
    message: lines.join("\n"),
  };
}
