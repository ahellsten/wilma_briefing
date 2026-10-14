import type { Briefing, BriefingDay } from "./briefing.js";
import { addDays, weekday } from "./dates.js";

export type Language = "fi" | "en";

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

/** Keep Wilma text from breaking the card's Markdown. */
function md(text: string): string {
  return text.replace(/\s+/g, " ").replace(/([\\`*_[\]<>|#])/g, "\\$1").trim();
}

/** State of the briefing sensor (max 255 chars in HA). */
export function briefingState(b: Briefing, lang: Language): string {
  const first = b.days[0];
  return first ? capitalize(dayLabel(first.date, b.today, lang)) : "–";
}

function renderDay(day: BriefingDay, b: Briefing, lang: Language, withHeading: boolean): string[] {
  const s = STRINGS[lang];
  const out: string[] = [];
  const span = day.firstStart ? ` · ${t(day.firstStart)}–${t(day.lastEnd)}` : "";
  if (withHeading) out.push(`#### ${capitalize(dayLabel(day.date, b.today, lang))}${span}`, "");
  for (const exam of day.exams) {
    const topic = exam.topic ? `: ${md(exam.topic)}` : "";
    const time = exam.time ? ` ${t(exam.time)}` : "";
    out.push(`<ha-alert alert-type="warning">${s.exam}${time} – ${md(exam.subject || exam.name)}${topic}</ha-alert>`, "");
  }
  for (const l of day.lessons) {
    const room = l.room ? ` · ${md(l.room)}` : "";
    out.push(`**${t(l.start)}–${t(l.end)}** ${md(l.subject)}${room}  `);
    for (const h of l.homework) {
      out.push(`> 📚 ${md(h.homework)} *(${s.givenOn} ${formatDate(h.date, lang)})*`, "");
    }
  }
  out.push("");
  return out;
}

/** The card body for one child; the dashboard shows it with a Markdown card. */
export function renderMarkdown(b: Briefing, lang: Language): string {
  const s = STRINGS[lang];
  const out: string[] = [];
  const first = b.days[0];
  const span = first?.firstStart && b.days.length === 1 ? ` · ${t(first.firstStart)}–${t(first.lastEnd)}` : "";
  out.push(`### ${md(b.student.name)} – ${first ? dayLabel(first.date, b.today, lang) : "–"}${span}`, "");

  if (!b.days.length) out.push(s.noLessons, "");
  b.days.forEach((day) => out.push(...renderDay(day, b, lang, b.days.length > 1)));

  const shown = new Set(b.days.flatMap((d) => d.exams.map((e) => e.examId)));
  const later = b.upcomingExams.filter((e) => !shown.has(e.examId)).slice(0, 3);
  if (later.length) {
    out.push(`**${s.upcoming}:** ` + later.map((e) => `${formatDate(e.date, lang)} ${md(e.subject || e.name)}`).join(", "), "");
  }

  if (b.unreadCount > 0) {
    const list = b.unreadMessages
      .slice(0, 5)
      .map((m) => `<br>• ${md(m.subject)}${m.senderName ? ` – ${md(m.senderName)}` : ""}`)
      .join("");
    out.push(`<ha-alert alert-type="info">✉️ ${s.unread(b.unreadCount)}${list}</ha-alert>`, "");
  }
  if (b.warnings.length) out.push(`<ha-alert alert-type="error">${s.warning}</ha-alert>`, "");
  return out.join("\n").trim();
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
  if (b.unreadCount) parts.push(`✉️ ${b.unreadCount}`);
  return `${b.student.name}: ${parts.join(" · ")}`;
}

export function renderNotification(briefings: Briefing[], targetDate: string, today: string, lang: Language) {
  const lines = briefings
    .filter((b) => b.days[0]?.date === targetDate)
    .map((b) => notificationLine(b, lang))
    .filter((l): l is string => l !== null);
  const others = briefings.filter((b) => b.days[0]?.date !== targetDate && b.unreadCount > 0);
  for (const b of others) lines.push(`${b.student.name}: ✉️ ${STRINGS[lang].unread(b.unreadCount)}`);
  return {
    title: `${STRINGS[lang].title}: ${dayLabel(targetDate, today, lang)}`,
    message: lines.join("\n"),
  };
}
