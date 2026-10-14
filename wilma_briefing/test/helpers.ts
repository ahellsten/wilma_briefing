import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchAll, type FetchResult, type Runner } from "../src/wilma.js";

const fixture = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"));

/** A runner that answers like the wilma CLI from the fixtures (week of Mon 12 – Fri 16 Oct 2026). */
export const fixtureRunner: Runner = async (args) => {
  const cmd = args.join(" ");
  if (cmd === "summary") return fixture("summary");
  if (cmd.startsWith("homework")) return fixture("homework");
  if (cmd === "schedule week") return fixture("schedule-week");
  if (cmd === "schedule next-week") return fixture("schedule-next-week");
  throw new Error(`unexpected command: ${cmd}`);
};

export const loadData = (): Promise<FetchResult> => fetchAll(fixtureRunner, { includeNextWeek: true });
