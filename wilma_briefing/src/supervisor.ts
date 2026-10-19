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

export interface NotifyTargets {
  /** Legacy notify services, e.g. "mobile_app_phone". */
  services: string[];
  /** Notify entities without "notify.", e.g. "phone". */
  entities: string[];
}

async function notifyTargets(): Promise<NotifyTargets> {
  const [domains, states] = (await Promise.all([call("GET", "/core/api/services"), call("GET", "/core/api/states")])) as [
    { domain: string; services: Record<string, unknown> }[],
    { entity_id: string }[],
  ];
  return {
    services: Object.keys(domains.find((d) => d.domain === "notify")?.services ?? {}).filter((k) => k !== "send_message"),
    entities: states.map((s) => s.entity_id).filter((id) => id.startsWith("notify.")).map((id) => id.slice("notify.".length)),
  };
}

export function resolveTarget(target: string, known: NotifyTargets): "service" | "entity" | null {
  if (known.services.includes(target)) return "service";
  return known.entities.includes(target) ? "entity" : null;
}

export function missingTargetMessage(target: string, known: NotifyTargets): string {
  const guess = known.services.find((k) => k === `mobile_app_${target}`);
  const hint = guess ? ` Did you mean "${guess}"?` : "";
  const list = (names: string[]) => names.join(", ") || "none";
  return `notify.${target} is neither a notify service nor a notify entity.${hint} Entities: ${list(known.entities)}. Services: ${list(known.services)}`;
}

/** Problems with the configured notify targets, or null when they all exist (or HA can't be asked). */
export async function checkNotifyTargets(targets: string[]): Promise<string | null> {
  if (!targets.length || process.env.DRY_RUN) return null;
  const known = await notifyTargets().catch(() => null);
  if (!known) return null;
  const missing = targets.filter((t) => !resolveTarget(t, known));
  return missing.length ? missing.map((t) => missingTargetMessage(t, known)).join("; ") : null;
}

/**
 * Sends a notification through Home Assistant Core. `target` is a legacy
 * notify service (notify.mobile_app_phone) or a notify entity
 * (notify.phone, sent with notify.send_message), without "notify.".
 */
export async function notify(target: string, title: string, message: string): Promise<void> {
  if (process.env.DRY_RUN) {
    console.log(`[dry-run] notify.${target}: ${title}\n${message}`);
    return;
  }
  const known = await notifyTargets().catch(() => null);
  const kind = known ? resolveTarget(target, known) : "service";
  if (!kind) throw new Error(missingTargetMessage(target, known!));
  if (kind === "service") {
    await call("POST", `/core/api/services/notify/${encodeURIComponent(target)}`, { title, message });
  } else {
    await call("POST", "/core/api/services/notify/send_message", { entity_id: `notify.${target}`, title, message });
  }
}
