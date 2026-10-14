# Wilma Briefing

A Home Assistant add-on that shows your children's next school day from Wilma: the lessons, homework highlighted on the lesson it's due, exams and unread messages. It runs as a dashboard card and sends a daily notification the evening before each school day. It uses [WilmAI](https://github.com/aikarjal/wilmai) to read Wilma.

User documentation is in [wilma_briefing/DOCS.md](wilma_briefing/DOCS.md). Home Assistant also shows it on the add-on's Documentation tab.

## Install

1. Install the **Mosquitto broker** add-on and set up the **MQTT** integration.
2. Add this repository in the app store (called the add-on store before Home Assistant 2026): **⋮ → Repositories →** `https://github.com/ahellsten/wilma_briefing`. Alternatively, copy `wilma_briefing/` into the local apps folder and install it from the store's *Local* section. Newer versions show that folder as `/local_apps` over Samba/SSH; older ones as `/addons`.
3. Install **Wilma Briefing**, fill in the Wilma address, username, password and notify service, and start it.
4. Add the Markdown card from [DOCS.md](wilma_briefing/DOCS.md#dashboard-card).

## How it works

```
wilma CLI (summary, homework, schedule week/next-week)
        │  JSON
        ▼
  fetchAll ─► buildBriefing (target day + homework matching) ─► render (Markdown / notification)
        │                                                              │
   Scheduler (active hours, cutoff, backoff)                  MQTT discovery ─► HA entities
                                                              Supervisor API ─► notify.*
```

| File | Purpose |
|---|---|
| `src/wilma.ts` | Runs the `wilma` CLI and merges its JSON per child |
| `src/briefing.ts` | Picks the days to show and matches homework to lessons |
| `src/render.ts` | Card Markdown and notification text (fi/en) |
| `src/scheduler.ts` | Refresh timing, the cutoff switch and the daily notification |
| `src/mqtt.ts` | MQTT discovery and states |
| `src/supervisor.ts` | Supervisor API (MQTT credentials, notify) |

## Development

```bash
cd wilma_briefing
npm ci
npm test          # vitest, synthetic fixtures in test/fixtures
npm run lint      # type-check
```

To run locally against a test broker, with notifications printed instead of sent:

```bash
docker run -d --name mqtt -p 1883:1883 eclipse-mosquitto:2 mosquitto -c /mosquitto-no-auth.conf
docker build -t wilma-briefing wilma_briefing
docker run --rm --network host -v "$PWD/.data:/data" \
  -e MQTT_URL=mqtt://localhost:1883 -e DRY_RUN=1 -e TZ=Europe/Helsinki \
  wilma-briefing
# .data/options.json holds the add-on options (see wilma_briefing/config.yaml)
mosquitto_sub -h localhost -t 'homeassistant/#' -t 'wilma_briefing/#' -v
```
