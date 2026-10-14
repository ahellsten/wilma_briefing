# CLAUDE.md

Home Assistant add-on in `wilma_briefing/` (TypeScript, Node 22). It runs `@wilm-ai/wilma-cli` and publishes MQTT discovery entities. User docs are in `wilma_briefing/DOCS.md`, the overview is in `README.md`, and planned work is in `BACKLOG.md`.

## Privacy: never commit real Wilma data

Users may paste real `wilma … --json` output for debugging. Use it only in temporary files and delete them afterwards. Fixtures and tests must use invented values for everything: children's and teachers' names, student numbers, subjects, homework texts, course codes, rooms, group ids and dates (shift them, e.g. to 2030). Keep only the *shape* of the data. Before committing, search the repo for anything from a pasted sample.

## wilma-cli data quirks (verified against real output)

- In the schedule, `subjectCode` is just the first word of the caption (`"Englanti,"`, `"Musiikki.3"`). Homework has real course codes (`SUK_3LV`). Codes never match across the two sources, so `sameSubject` matches by **name** and falls back to codes only when a name is missing.
- Homework `date` is the day of the lesson where it was given. There is no due date. Homework counts as due at the subject's next lesson: the newest item since that subject's previous lesson.
- The timetable lists normal lessons during school holidays, and nothing marks a holiday (see BACKLOG.md).
- Errors are printed as JSON on stdout: `{status:"error", code, message, hint}`. `login_failed`, `mfa_*`, `not_logged_in` and `config_invalid` are auth errors.
- Every new Wilma login logs the parent out of their browser session. Keep refreshes infrequent and don't retry auth failures quickly.

## Development

```bash
cd wilma_briefing
npm ci            # .npmrc has legacy-peer-deps; vite is listed explicitly for vitest
npm test          # vitest
npm run lint      # tsc --noEmit
```

To run locally, build the image and run it with `MQTT_URL=mqtt://…`, `DRY_RUN=1` (notifications are printed, not sent), and optionally `WILMA_BIN=<script>` to replace the CLI with a fake that serves fixtures. Options are read from `/data/options.json`.

## Don't break

- MQTT `unique_id`s are `wilma_briefing_<studentNumber>_<key>`. Changing them duplicates entities on existing installs.
- Pin dependency versions exactly, and pick releases at least two weeks old. The wilma-cli version is a Docker build argument.
- Keep the pure logic (`briefing.ts`, `render.ts`, `dates.ts`) free of I/O, so it stays unit-testable.
- When adding an option, update all of these: `config.yaml` (options and schema), `src/options.ts`, `translations/{en,fi}.yaml` and `DOCS.md`.
