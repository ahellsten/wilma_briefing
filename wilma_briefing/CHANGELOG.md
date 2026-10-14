# Changelog

## 0.2.0

- Rewritten as a long-running add-on that publishes Home Assistant entities over MQTT discovery.
- Per-child briefing sensor with a ready-made Markdown card body: the next school day's lessons, homework highlighted on the lesson it is due, exams and unread messages.
- The card switches to the next school day at a configurable time (default 16:00).
- Daily push notification on the evening before each school day.
- Refreshes hourly during active hours only, with backoff on errors. A refresh button is included.
- Finnish and English.
- Shows only the child's first name by default (`name_display: full` for the full name).
