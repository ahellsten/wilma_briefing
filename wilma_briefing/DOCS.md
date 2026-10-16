# Wilma Briefing

Shows your children's next school day from [Wilma](https://www.visma.fi/wilma/) in Home Assistant. It covers the lessons, any homework due at each lesson, exams and unread messages. It uses [WilmAI](https://github.com/aikarjal/wilmai) (`@wilm-ai/wilma-cli`) to read Wilma. Access is read-only: the add-on never sends anything to Wilma and never marks messages read.

## Requirements

- The **Mosquitto broker** add-on and the **MQTT** integration. Entities are created through MQTT discovery.
- A guardian's Wilma username and password.

## Configuration

| Option | Default | |
|---|---|---|
| `wilma_tenant` | | Wilma address, e.g. `https://espoo.inschool.fi` |
| `wilma_username` / `wilma_password` | | Guardian login |
| `wilma_totp_secret` | | Only for accounts with two-step verification |
| `language` | `fi` | `fi` or `en` |
| `name_display` | `first` | `first`: show only the child's first name; `full`: the full name as Wilma gives it |
| `cutoff_time` | `16:00` | Before this time the card shows today; after it, the next school day |
| `days_ahead` | `1` | School days to show after the cutoff (1–5) |
| `homework_lookback_days` | `7` | How far back to look for homework |
| `refresh_interval_minutes` | `60` | Fetch interval during active hours |
| `active_hours_start` / `_end` | `06:30` / `21:30` | No fetching outside these hours |
| `notify_enabled` | `true` | Daily notification |
| `notify_services` | `[]` | e.g. `mobile_app_my_phone` (without `notify.`) |

## Entities

There is one device per child, named "Wilma <name>". With the default `name_display: first`, `<name>` is the first name. Siblings who share a first name keep their full names. Entity IDs are set when Home Assistant first creates the entities. Changing `name_display` later renames the device but keeps the existing IDs. The entity IDs below assume a child called Aino:

| Entity | State | Attributes |
|---|---|---|
| `sensor.wilma_aino_briefing` | e.g. `Huomenna to 15.10.` | `markdown` (the card body), `days` (lessons with their homework), `target_dates`, `first_start`, `last_end` |
| `sensor.wilma_aino_homework` | number of homework items due on the days shown | `items` |
| `sensor.wilma_aino_unread_messages` | number of unread messages | `messages` (subject, sender, sent_at) |
| `sensor.wilma_aino_next_exam` | date of the next exam | subject, name, topic, time |

The add-on device has three more entities:

- `button.wilma_refresh`: fetch now. Presses within 5 minutes of the last fetch are ignored.
- `sensor.wilma_last_update`: when data was last fetched.
- `binary_sensor.wilma_problem`: on when a fetch failed or some data was missing. The `error` attribute says why.

## How homework is matched

Wilma records homework on the lesson where it was given and has no due date. The add-on treats homework as due at the **next lesson of the same subject**. For each lesson shown, it lists the newest homework given since that subject's previous lesson, within `homework_lookback_days`. Subjects match by name, so `Englanti` matches `Englanti, A1`. The course code is used only when a name is missing.

## When data is fetched

- On start, then every `refresh_interval_minutes` during active hours.
- Once more 5 minutes before `cutoff_time`, so the evening view and the notification use fresh data.
- When `button.wilma_refresh` is pressed.

Wilma's data changes slowly, so hourly is plenty. Also, **each new Wilma login logs you out of Wilma in your browser**. WilmAI reuses one session for up to 6 hours, which keeps the number of logins to a few per day. After a failed login the add-on waits 6 hours before trying again, so that a wrong password doesn't lock the account. Fix the password and restart the add-on to retry right away.

## Daily notification

This is sent at `cutoff_time` on the **evening before a school day** to every service in `notify_services`. For a Monday it comes on Sunday evening, and holidays are skipped. It has one line per child: the school day's hours, which subjects have homework, any exams and the unread message count.

## Dashboard card

```yaml
type: markdown
content: "{{ state_attr('sensor.wilma_aino_briefing', 'markdown') }}"
```

For several children:

```yaml
type: vertical-stack
cards:
  - type: markdown
    content: "{{ state_attr('sensor.wilma_aino_briefing', 'markdown') }}"
  - type: markdown
    content: "{{ state_attr('sensor.wilma_eero_briefing', 'markdown') }}"
```

## Instant alert for new messages (optional)

This is an ordinary automation that you create yourself:

1. Go to **Settings → Automations & scenes → Create automation → Create new automation**.
2. Open **⋮ → Edit in YAML** and paste the example below.
3. Replace the entity IDs with your children's unread message sensors. You can find them under **Settings → Devices & services → MQTT**, on each child's Wilma device. Replace `notify.mobile_app_my_phone` with your own notify service.
4. Save. The automation works right away.

```yaml
alias: Wilma – new message
triggers:
  - trigger: state
    entity_id:
      - sensor.wilma_aino_unread_messages
      - sensor.wilma_eero_unread_messages
conditions:
  - "{{ trigger.to_state.state | int(0) > trigger.from_state.state | int(0) }}"
actions:
  - action: notify.mobile_app_my_phone
    data:
      title: "Wilma: {{ state_attr(trigger.entity_id, 'friendly_name') }}"
      message: "{{ (state_attr(trigger.entity_id, 'messages') or [{}])[0].subject | default('New message') }}"
```

## Recorder (optional)

The briefing attributes can be large. Excluding them keeps the history database smaller, and it also keeps the children's school data out of history.

This setting goes in Home Assistant's `configuration.yaml` and can't be made in the UI:

1. Open `/homeassistant/configuration.yaml`, for example with the **File editor** or **Studio Code Server** add-on, or over the Samba share.
2. Add the block below. If the file already has a `recorder:` section, add the `exclude` part to it instead of adding a second `recorder:`.
3. Restart Home Assistant (**Settings → System → ⋮ → Restart Home Assistant**). Reloading YAML is not enough for the recorder.

```yaml
recorder:
  exclude:
    entity_globs:
      - sensor.wilma_*_briefing
      - sensor.wilma_*_homework
```

## Privacy

The Wilma password is stored in the add-on options, like any add-on secret. WilmAI's session cache is stored under the add-on's `/data`. Data goes only to your Home Assistant, through MQTT.
