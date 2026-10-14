import mqtt, { type MqttClient } from "mqtt";
import type { Briefing } from "./briefing.js";
import { supervisorGet } from "./supervisor.js";

const PREFIX = "homeassistant";
const BASE = "wilma_briefing";
const AVAILABILITY = `${BASE}/status`;
const REFRESH = `${BASE}/refresh/set`;

const HUB_DEVICE = {
  identifiers: [BASE],
  name: "Wilma Briefing",
  manufacturer: "WilmAI",
  model: "Home Assistant add-on",
};

export interface BrokerConfig {
  url: string;
  username?: string;
  password?: string;
}

/** MQTT_URL (local testing) or the broker the Supervisor hands out (Mosquitto add-on). */
export async function brokerConfig(): Promise<BrokerConfig> {
  if (process.env.MQTT_URL) {
    return { url: process.env.MQTT_URL, username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD };
  }
  const { data } = (await supervisorGet("/services/mqtt")) as {
    data: { host: string; port: number; ssl?: boolean; username?: string; password?: string };
  };
  return { url: `${data.ssl ? "mqtts" : "mqtt"}://${data.host}:${data.port}`, username: data.username, password: data.password };
}

/** HA-style slug: "Äijälä Öljy" -> "aijala_oljy". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

type Component = "sensor" | "binary_sensor" | "button";

interface Entity {
  component: Component;
  objectId: string;
  config: Record<string, unknown>;
}

export class HaMqtt {
  private readonly discovery = new Map<string, Entity>();
  private readonly retained = new Map<string, string>();

  private constructor(private readonly client: MqttClient) {}

  static async connect(cfg: BrokerConfig, onRefresh: () => void, log: (msg: string) => void): Promise<HaMqtt> {
    const client = mqtt.connect(cfg.url, {
      username: cfg.username,
      password: cfg.password,
      clientId: `${BASE}_${Math.random().toString(16).slice(2, 8)}`,
      will: { topic: AVAILABILITY, payload: Buffer.from("offline"), retain: true, qos: 1 },
      reconnectPeriod: 10_000,
    });
    const ha = new HaMqtt(client);
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", reject);
    });
    client.on("error", (err) => log(`MQTT error: ${err.message}`));
    client.on("connect", () => ha.announce()); // reconnects
    client.on("message", (topic, payload) => {
      if (topic === REFRESH) onRefresh();
      // HA restarted: send discovery and states again.
      if (topic === `${PREFIX}/status` && payload.toString() === "online") ha.announce();
    });
    await client.subscribeAsync([REFRESH, `${PREFIX}/status`]);
    ha.registerHub();
    ha.announce();
    return ha;
  }

  private registerHub() {
    const avail = { availability_topic: AVAILABILITY, device: HUB_DEVICE };
    this.add({
      component: "button",
      objectId: "wilma_refresh",
      config: { ...avail, name: "Refresh", unique_id: `${BASE}_refresh`, command_topic: REFRESH, icon: "mdi:refresh" },
    });
    this.add({
      component: "sensor",
      objectId: "wilma_last_update",
      config: {
        ...avail,
        name: "Last update",
        unique_id: `${BASE}_last_update`,
        state_topic: `${BASE}/last_update/state`,
        device_class: "timestamp",
        entity_category: "diagnostic",
      },
    });
    this.add({
      component: "binary_sensor",
      objectId: "wilma_problem",
      config: {
        ...avail,
        name: "Problem",
        unique_id: `${BASE}_problem`,
        state_topic: `${BASE}/problem/state`,
        json_attributes_topic: `${BASE}/problem/attributes`,
        device_class: "problem",
        entity_category: "diagnostic",
      },
    });
  }

  private registerStudent(sn: string, name: string) {
    const slug = slugify(name) || sn;
    const device = { identifiers: [`${BASE}_${sn}`], name: `Wilma ${name}`, manufacturer: "Wilma", model: "Student", via_device: BASE };
    const sensor = (key: string, label: string, extra: Record<string, unknown>) =>
      this.add({
        component: "sensor",
        objectId: `wilma_${slug}_${key}`,
        config: {
          name: label,
          unique_id: `${BASE}_${sn}_${key}`,
          availability_topic: AVAILABILITY,
          state_topic: `${BASE}/${sn}/${key}/state`,
          json_attributes_topic: `${BASE}/${sn}/${key}/attributes`,
          device,
          ...extra,
        },
      });
    sensor("briefing", "Briefing", { icon: "mdi:school" });
    sensor("homework", "Homework", { icon: "mdi:book-open-variant" });
    sensor("unread_messages", "Unread messages", { icon: "mdi:email-alert" });
    sensor("next_exam", "Next exam", { icon: "mdi:file-document-edit", device_class: "date" });
  }

  private add(entity: Entity) {
    const topic = `${PREFIX}/${entity.component}/${entity.objectId}/config`;
    const fresh = !this.discovery.has(topic);
    // default_entity_id gives stable entity ids on HA versions that support it;
    // older ones derive the same ids from device + entity name.
    this.discovery.set(topic, { ...entity, config: { ...entity.config, default_entity_id: `${entity.component}.${entity.objectId}` } });
    if (fresh && this.client.connected) this.publishDiscovery(topic);
  }

  private publishDiscovery(topic: string) {
    this.client.publish(topic, JSON.stringify(this.discovery.get(topic)!.config), { retain: true, qos: 1 });
  }

  private announce() {
    for (const topic of this.discovery.keys()) this.publishDiscovery(topic);
    this.client.publish(AVAILABILITY, "online", { retain: true, qos: 1 });
    for (const [topic, payload] of this.retained) this.client.publish(topic, payload, { retain: true });
  }

  private set(topic: string, payload: unknown) {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    if (this.retained.get(topic) === text) return;
    this.retained.set(topic, text);
    this.client.publish(topic, text, { retain: true });
  }

  publishBriefing(b: Briefing, state: string, markdown: string) {
    const sn = b.student.studentNumber;
    this.registerStudent(sn, b.student.name);
    const t = (key: string) => `${BASE}/${sn}/${key}`;

    this.set(`${t("briefing")}/state`, state.slice(0, 255));
    this.set(`${t("briefing")}/attributes`, {
      student: b.student.name,
      mode: b.mode,
      target_dates: b.days.map((d) => d.date),
      first_start: b.days[0]?.firstStart ?? null,
      last_end: b.days[0]?.lastEnd ?? null,
      days: b.days,
      markdown,
    });

    const homework = b.days.flatMap((d) =>
      d.lessons.flatMap((l) => l.homework.map((h) => ({ due: d.date, subject: l.subject, text: h.homework, given: h.date, teacher: h.teacher })))
    );
    this.set(`${t("homework")}/state`, String(b.homeworkCount));
    this.set(`${t("homework")}/attributes`, { items: homework });

    this.set(`${t("unread_messages")}/state`, String(b.unreadCount));
    this.set(`${t("unread_messages")}/attributes`, {
      messages: b.unreadMessages.map((m) => ({ id: m.wilmaId, subject: m.subject, sender: m.senderName, sent_at: m.sentAt })),
    });

    const exam = b.nextExam;
    this.set(`${t("next_exam")}/state`, exam?.date ?? "None");
    this.set(`${t("next_exam")}/attributes`, exam
      ? { subject: exam.subject, name: exam.name, topic: exam.topic, time: exam.time ?? null, teacher: exam.teacher }
      : {});
  }

  publishStatus(status: { lastUpdate?: Date; problem: string | null; code?: string }) {
    if (status.lastUpdate) this.set(`${BASE}/last_update/state`, status.lastUpdate.toISOString());
    this.set(`${BASE}/problem/state`, status.problem ? "ON" : "OFF");
    this.set(`${BASE}/problem/attributes`, { error: status.problem, code: status.code ?? null });
  }

  async close() {
    await this.client.publishAsync(AVAILABILITY, "offline", { retain: true, qos: 1 });
    await this.client.endAsync();
  }
}
