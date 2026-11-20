# Tasks: morning review fallback

Each task ends with `npm run check` and `npm test` passing. Commit only after the whole group, using the `<verb>: <description>` format, and ask the user first.

- [x] 1. Reproduce the bug
  - [x] 1.1 Add a failing test in `tests/vault/tasks.test.ts`: today is 2026-11-20, there is a note for 2026-11-18 with one open task, and none for 2026-11-19. `reviewTasks` should list the task. It currently returns an empty list.
  - _Requirements: 1.2_

- [x] 2. Date helpers and note listing
  - [x] 2.1 Add `latestBefore` and `gapDays` to `src/bujo/journal-date.ts`, with table tests (month end, year end, leap day, DST change day) and the `fast-check` property from the design.
  - [x] 2.2 Add `dailyNoteDates(config)` to `src/vault/paths.ts`. Rewrite `dailyNoteDatesIn` to filter it. Add tests with junk file names, a missing `Daily/` folder, and several months.
  - _Requirements: 1.3, 1.4_

- [x] 3. Review logic
  - [x] 3.1 Add `ReviewSource` and `source` to `ReviewResult` in `src/vault/tasks.ts`. Update the `streak` doc comment.
  - [x] 3.2 Change `reviewTasks` to pick the source day as in the design. Keep `path`, `exists`, and `yesterday` describing yesterday.
  - [x] 3.3 Add tests for every case in Requirement 5.3, including that an empty yesterday note does not trigger the fallback and that an empty older note stops the search.
  - [x] 3.4 Add a test that migrates a task from a fallback source day to today, and check the origin link and the `[>]` mark.
  - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 3.1, 3.2, 5.3, 5.4_

- [x] 4. CLI output
  - [x] 4.1 Update `src/cli/task-review.ts` with the three text cases, the weekday, and the plural helper. Update the command description ("List open tasks from yesterday, or from the last earlier note when yesterday has none").
  - [x] 4.2 Add CLI tests for text and `--json` output in all three cases.
  - _Requirements: 2.4, 2.5, 2.6_

- [x] 5. Skill
  - [x] 5.1 Edit step 2 of `skills/morning-planning/SKILL.md` as in the design. Update the wording in the later steps that say "yesterday" so that they use the source day. Update the scheduling rule.
  - [x] 5.2 Update the skill's `description` frontmatter only if it still reads as "yesterday's" only. Keep it to `name` and `description`.
  - [x] 5.3 Run `npm run dev -- skills install --target .kiro/skills` and read the installed step 2 once.
  - _Requirements: 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 6. Spec housekeeping
  - [x] 6.1 In `.kiro/specs/morning-planning/requirements.md`, add a note under Decision 1 and Requirement 4.7 that `morning-review-fallback` changes them when yesterday has no note.
  - [x] 6.2 Run `npm pack --dry-run` and confirm nothing unexpected is published.
  - _Requirements: 5.1, 5.2_
