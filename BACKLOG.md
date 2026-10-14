# Backlog

## Holidays option

Wilma's timetable lists the normal weekly lessons during school holidays (seen in autumn break 2026: the week had full lessons in `wilma schedule week`). wilmai gives no holiday information. As a result, during a break the card shows lessons and the daily notification is sent every evening.

Proposal:

- A new option, `holidays`: a list of dates or date ranges, e.g. `["2026-10-12..2026-10-16", "2026-12-21..2027-01-06"]`.
- In `fetchAll` (or `buildBriefing`), drop lessons on holiday dates. Target-day selection then skips them, and the notification goes out on the evening before the first school day after the break.
- Also drop holiday lessons from the "previous lesson of the subject" lookup in `homeworkFor`. Then homework given before the break stays highlighted for the first lesson after it. The lookback window must reach across the break, so extend it by the length of any holidays in between.
- Optionally show "Loma / Holiday" on the card during a break, instead of the next lessons.
- Tests: a break in the middle of a week, a break spanning a weekend, and homework given before the break.
