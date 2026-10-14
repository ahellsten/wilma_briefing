/** Calls to the HA Supervisor API (token injected into add-on containers). */

const SUPERVISOR = process.env.SUPERVISOR_URL ?? "http://supervisor";

async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) throw new Error("SUPERVISOR_TOKEN is not set (not running as an add-on?)");
  const res = await fetch(`${SUPERVISOR}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : undefined;
}

export const supervisorGet = (path: string) => call("GET", path);

/** notify.<service> through Home Assistant Core. */
export async function notify(service: string, title: string, message: string): Promise<void> {
  if (process.env.DRY_RUN) {
    console.log(`[dry-run] notify.${service}: ${title}\n${message}`);
    return;
  }
  await call("POST", `/core/api/services/notify/${encodeURIComponent(service)}`, { title, message });
}
