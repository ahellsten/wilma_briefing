# Changelog

## Unreleased

- Homework is shown in its own green box above the upcoming exams, instead of under each lesson. Each item shows the subject, its due day and the day it was given, and stays listed until the subject's next lesson has passed.
- Homework due dates read "huomiselle" / "for tomorrow" or just the date ("23.10. mennessä").
- New grades: shown on the card for 7 days after they appear in Wilma, announced once in the daily notification, and in a new `sensor.wilma_<name>_new_grades`.
- The briefing sensor has an `html` attribute: the same card using only `<b>`, `<i>` and `<br>`, for widgets that don't show Markdown.
- Classrooms are hidden by default. Set `show_rooms: true` to show them after each lesson.
- Fix an unread message showing twice when Wilma lists it in both the inbox and the appointments folder.
- `sensor.wilma_<name>_homework` now counts all homework still to do, not only what is due on the days shown.

## 0.2.1

- Fix every lesson showing twice on the card for today and tomorrow.

## 0.2.0

- Rewritten as a long-running add-on that publishes Home Assistant entities over MQTT discovery.
- Per-child briefing sensor with a ready-made Markdown card body: the next school day's lessons, homework highlighted on the lesson it is due, exams and unread messages.
- The card switches to the next school day at a configurable time (default 16:00).
- Daily push notification on the evening before each school day.
- Refreshes hourly during active hours only, with backoff on errors. A refresh button is included.
- Finnish and English.
- Shows only the child's first name by default (`name_display: full` for the full name).
