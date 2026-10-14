import { readFileSync } from "node:fs";
import { parseHHMM } from "./dates.js";
import type { Language } from "./render.js";
import type { NameDisplay } from "./wilma.js";

export interface Options {
  tenant: string;
  username: string;
  password: string;
  totpSecret?: string;
  language: Language;
  nameDisplay: NameDisplay;
  cutoffMinutes: number;
  daysAhead: number;
  lookbackDays: number;
  refreshMinutes: number;
  activeStart: number;
  activeEnd: number;
  notifyEnabled: boolean;
  notifyServices: string[];
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/** Reads the add-on options (HA validates types against config.yaml's schema first). */
export function loadOptions(path = process.env.OPTIONS_PATH ?? "/data/options.json"): Options {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const required = (key: string) => {
    const v = String(raw[key] ?? "").trim();
    if (!v) throw new Error(`Option "${key}" is required`);
    return v;
  };
  return {
    tenant: required("wilma_tenant"),
    username: required("wilma_username"),
    password: required("wilma_password"),
    totpSecret: String(raw.wilma_totp_secret ?? "").trim() || undefined,
    language: raw.language === "en" ? "en" : "fi",
    nameDisplay: raw.name_display === "full" ? "full" : "first",
    cutoffMinutes: parseHHMM(raw.cutoff_time ?? "16:00"),
    daysAhead: clampInt(raw.days_ahead, 1, 5, 1),
    lookbackDays: clampInt(raw.homework_lookback_days, 1, 21, 7),
    refreshMinutes: clampInt(raw.refresh_interval_minutes, 15, 240, 60),
    activeStart: parseHHMM(raw.active_hours_start ?? "06:30"),
    activeEnd: parseHHMM(raw.active_hours_end ?? "21:30"),
    notifyEnabled: raw.notify_enabled !== false,
    notifyServices: (Array.isArray(raw.notify_services) ? raw.notify_services : [])
      .map((s: unknown) => String(s).trim().replace(/^notify\./, ""))
      .filter(Boolean),
  };
}
