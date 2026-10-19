# Changelog

## 0.3.8

- `notify_services` also accepts notify entities (e.g. `my_phone` for `notify.my_phone`), which are sent with `notify.send_message`. Before, these failed with "HTTP 400".
- The notify targets are checked at startup. A target that is neither a service nor an entity turns on `binary_sensor.wilma_problem`, and the log lists the notify entities and services that exist, instead of a bare "HTTP 400" at notification time.

## 0.3.7

- Remove the gap between box items in the `html` attribute again: it couldn't be made small enough in the Android widget.

## 0.3.6

- Fix the gap between box items in the `html` attribute being as tall as a full line in the Android widget.

## 0.3.5

- In the `html` attribute, box items are separated by a small gap so separate homework items, exams and messages are easier to tell apart.

## 0.3.4

- Unread messages come before the upcoming exams, and the upcoming exams box is orange.
- Box headings on the card are bold.

## 0.3.3

- The homework due day is bold, like the subject.
- Homework due next week shows its due day ("ma 26.10. mennessä") instead of "seuraavalle tunnille": next week's timetable is now fetched on every refresh, not only from Thursday on. Due dates also show the weekday.
- Upcoming exams are shown in a blue box like messages, one per line with the subject, day and topic.

## 0.3.2

- The heading of the `html` attribute (name and day) is larger (`<big>`), so it stands out in the widget.

## 0.3.1

- The `html` attribute is left-aligned instead of centred in the Android widget. New `html_align` option: `left`, `center` or `right`.
- New `html_min_lines` option (default 30): pads the `html` attribute with empty lines so a widget that centres its text shows it from the top.

## 0.3.0

- Homework is shown in its own green box above the upcoming exams, instead of under each lesson. Each item shows the subject, its due day and the day it was given, and stays listed until the subject's next lesson has passed.
- Homework due dates read "huomiselle" / "for tomorrow" or just the date ("23.10. mennessä").
- New grades: shown on the card for `new_grade_days` days (default 7) after they appear in Wilma, announced once in the daily notification, and in a new `sensor.wilma_<name>_new_grades`.
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
