# Tasks: morning planning

Each task builds on the ones before it and ends with `npm run check` and `npm test` passing. Commit only after a large group of tasks, not after each one, using the `<verb>: <description>` format.

- [x] 1. Groundwork
  - [x] 1.1 Install `fast-check` as a dev dependency. Add it to the library table in `.kiro/steering/tech.md` ("Property-based tests (dev)").
  - [x] 1.2 Add `addDays(date, n)` to `src/bujo/journal-date.ts`. It works on `YYYY-MM-DD` strings with date-fns, uses calendar days, and is unaffected by DST. Add tests across month ends, year ends, leap days, and DST change days.
  - [x] 1.3 Add the error codes `INVALID_REF` (exit 2), `TASK_NOT_FOUND`, `NOT_A_TASK`, and `TASK_NOT_OPEN` (exit 1) to `src/errors.ts`. Extend the exit-code test.
  - _Requirements: 1.3, 1.4, 4.1_

- [x] 2. Bullet model: trailing fields
  - [x] 2.1 Add `origin?: { date; blockId }`, `scheduled?`, and `blockId?` to `Bullet` in `src/bujo/types.ts`.
  - [x] 2.2 In `src/bujo/bullet.ts`, replace the signifier-only stripping with the trailing-field loop from the design. It accepts block ids, `⏳` dates, signifier tags, and origin links in any order at the end of the line. Origin links match with a full path ending in `Daily/` or as a basename only, and any alias is ignored. Block ids are parsed on every bullet type.
  - [x] 2.3 Extend `formatBullet` to write the fields in canonical order (text, origin link, tags, `⏳` date, `^id`). It takes an optional `{ folder }`: with a folder, the link is `[[<folder>/Daily/<date>#^<id>|from <date>]]`; without one, the link is basename-only.
  - [x] 2.4 Add `fingerprint(bullet)`: 8 hex characters of sha256 over canonical JSON of `{ type, depth, text, signifiers, origin }`.
  - [x] 2.5 In `src/bujo/capture.ts`, add the text refinements: no `⏳`, no trailing `^id`-like token, and no trailing `[[…#^…]]` link.
  - [x] 2.6 Add table tests:
    - Every field alone, all fields in canonical order, and shuffled hand-edited orders.
    - A field in the middle of the text stays in the text.
    - A field that appears twice keeps the one nearest the end.
    - Basename-only links, and a link whose path doesn't end in `Daily/`, which stays as text.
    - Block ids on events and notes.
    - Existing `core-daily-log` lines still parse the same.
    - Capture text that would be parsed as a field is rejected.
  - [x] 2.7 Add `fast-check` property tests:
    - For any valid bullet with any combination of the new fields, `parseBulletLine(formatBullet(b))` equals `b`, with and without a folder.
    - `fingerprint` doesn't change when only `state`, `scheduled`, or `blockId` changes.
  - _Requirements: 2.2, 2.7, 3.2, 6.2, 6.3_

- [x] 3. Refs and note helpers (pure)
  - [x] 3.1 Create `src/bujo/ref.ts` with `formatRef(date, line, fingerprint)` and `parseRef(value)`. `parseRef` throws `INVALID_REF` for a bad shape or an impossible date.
  - [x] 3.2 In `src/bujo/note.ts`:
    - Export `splitLines`, so edits can check the exact raw line (fingerprints come from `fingerprint()` in `bullet.ts`).
    - Add `appendLogLines(original, lines)`, which shares `appendToSection` and the `isSubsequence` guard with `appendCapture` and writes no callout.
  - [x] 3.3 Add tests:
    - Ref round trip, and rejection of bad refs.
    - `appendLogLines` on a new note, on an existing note, and on a note missing `## Log`, keeping every original line.
    - A `fast-check` property that `parseRef(formatRef(...))` round-trips.
  - _Requirements: 1.3, 2.4_

- [x] 4. Line edits (pure)
  - [x] 4.1 Create `src/bujo/edit.ts` with `setCheckbox`, `setScheduled`, `addBlockId`, and `applyLineEdits`, as described in the design's "Editing lines in place" section.
  - [x] 4.2 Add table tests:
    - `setCheckbox` keeps `* [ ]`, `+ [ ]`, space and tab indents, and trailing fields byte for byte.
    - `setScheduled` inserts before `^id`, appends at the end otherwise, and replaces an existing date.
    - `addBlockId` leaves a line with an existing block id unchanged.
    - `applyLineEdits` rejects edits that change the text, signifiers, indent, or origin, a stale `before`, a changed line count, and changes to other lines. CRLF line endings are kept.
  - [x] 4.3 Add `fast-check` property tests:
    - For any note and any valid edit, every unedited line is identical before and after.
    - Applying `setCheckbox`, `setScheduled`, or `addBlockId` keeps the line's fingerprint.
    - Any random `after` line with a different fingerprint is rejected.
  - _Requirements: 1.2, 2.8, 3.3_

- [x] 5. Migration planning (pure)
  - [x] 5.1 Create `src/bujo/migrate.ts` with `planMigration(note, rootLine, { newId, priority })`. It returns the source line edits and the target lines, following the design's "What gets migrated" section:
    - subtree boundaries;
    - classification of each bullet;
    - skipping branches under completed, scheduled, or cancelled tasks;
    - re-basing depth and capping it at 3;
    - reusing existing block ids, with collision retries for new ones;
    - `--priority` applying only to the root's copy.
  - [x] 5.2 Reject a root that isn't open, or migrated with a block id, with `TASK_NOT_OPEN`.
  - [x] 5.3 Add table tests for each row of the classification table, a nested root (depth 1 under a note), unrecognized lines inside the subtree, a block-id collision, and resuming a root that is already `[>]` with a block id.
  - [x] 5.4 Add a `fast-check` property: for any generated Log and any open task in it, the plan's target lines parse back to valid nesting, each copied task's origin points to a block id set in the source edits, and the source edits pass `applyLineEdits`.
  - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8_

- [x] 6. Config: `migrationFlagDays`
  - [x] 6.1 In `src/config.ts`, add `MigrationFlagDaysSchema` (an integer from 2 to 365, default 3) to `ConfigFileSchema`, `ConfigFile`, `LoadedConfig` (as a sourced value), and `VaultConfig`. Update `requireVault`.
  - [x] 6.2 In `src/cli/init.ts`, add `--flag-after-days <n>` with no prompt. When the flag isn't given, keep the existing value or use the default. Invalid input is `USAGE`. Show the value in the human output and in `describe()`.
  - [x] 6.3 In `src/cli/config-show.ts`, show `migrationFlagDays` and its source.
  - [x] 6.4 Update the `VaultConfig` literals in existing tests. Add tests:
    - An old config file without the key loads with 3 from `default`.
    - 1 and 366 in the file give `CONFIG_INVALID`, and the message names the key.
    - `init --flag-after-days 5` saves 5, and a later `init --force` without the flag keeps 5.
    - Invalid flag input exits 2.
  - _Requirements: 7.1–7.5_

- [ ] 7. Vault task operations: resolve, set, schedule
  - [ ] 7.1 Export `readIfExists` and `assertSupported` from `src/vault/daily.ts`. Add `ref` to each bullet that `readDailyNote` returns.
  - [ ] 7.2 Create `src/vault/tasks.ts` with `resolveRef(config, ref)`. It resolves the line, relocates by fingerprint when the line moved, fails with `TASK_NOT_FOUND` for a missing or ambiguous match, and with `NOT_A_TASK` for an event or a note.
  - [ ] 7.3 Add `setTaskState(config, ref, state, { dryRun, hooks })` and `scheduleTask(config, ref, date, { dryRun, hooks })`:
    - They use `applyLineEdits` and `replaceIfUnchanged`.
    - They return `unchanged` when there is nothing to change.
    - `scheduleTask` accepts open or scheduled tasks only (otherwise `TASK_NOT_OPEN`), and requires a date later than the note's date (otherwise `INVALID_DATE`).
  - [ ] 7.4 Add integration tests in a temp vault:
    - Each state change.
    - `unchanged`.
    - Relocation after a line is inserted above the task.
    - Ambiguous duplicates give `TASK_NOT_FOUND`.
    - `NOT_A_TASK`.
    - `NOTE_CHANGED` through the hook, leaving the file untouched.
    - A dry run writes nothing.
    - Rescheduling replaces the date.
    - No temp files are left behind.
  - _Requirements: 1.1–1.6, 3.1–3.4_

- [ ] 8. Vault task operations: migrate
  - [ ] 8.1 Add `migrateTask(config, ref, { to, priority, dryRun, now, hooks })` to `src/vault/tasks.ts`:
    - Resolve the ref, plan the migration with random base36 ids, and write the source first.
    - Then read the target, skip it if the root's copy is already there, and otherwise append with `appendLogLines`, using `writeNew` or `replaceIfUnchanged`.
    - `to` defaults to today's journal date and must be later than the source date.
    - Fail with `CONFIG_INVALID` before writing if the folder contains `[`, `]`, `|`, `#`, or `^`.
  - [ ] 8.2 Add integration tests:
    - Migrating into a new note and into an existing note matches fixture files.
    - Migrating a task with nested children.
    - A rerun returns `unchanged` for both notes.
    - A simulated failure after the source write, followed by a rerun with the same ref, finishes the migration without duplicates.
    - `NOTE_CHANGED` on the target leaves the target untouched and can be resumed.
    - `--priority`.
    - A dry run returns both contents and writes nothing.
    - An invalid folder name.
  - [ ] 8.3 Add a `fast-check` property: running `migrateTask` twice on a generated note gives the same files as running it once.
  - _Requirements: 2.1–2.9_

- [ ] 9. Review and streaks
  - [ ] 9.1 Add `migrationStreak(task, taskDate, loadNote)` and `reviewTasks(config, today)` to `src/vault/tasks.ts`, following the design:
    - Follow origin links back one day at a time, with a cache of parsed notes.
    - Stop silently at missing notes, missing lines, non-adjacent days, non-migrated sources, and unsupported note versions.
    - Return top-level open tasks with `children`, `streak`, `since`, and `flagged`.
  - [ ] 9.2 Add tests:
    - Streaks of 0, 1, and 4 days.
    - A gap day.
    - A deleted source line.
    - A hand-edited link to a non-adjacent day.
    - An unsupported note version mid-chain.
    - Flagging at thresholds 3 and 5.
    - Open tasks under a note or a completed task listed as top-level.
    - An empty result for a missing note or a note with no open tasks.
  - _Requirements: 4.1–4.8_

- [ ] 10. CLI commands
  - [ ] 10.1 Create `src/cli/task.ts` (the `task` group), plus `task-review.ts`, `task-set.ts` (with `<state>` limited by `.choices()`), `task-schedule.ts`, and `task-migrate.ts`. Each has the options and JSON shapes from the design, and human output with Bullet Journal symbols. Register the group in `src/cli/registers.ts`.
  - [ ] 10.2 Update `src/cli/log-show.ts`: add `ref` to the JSON bullets, and show `⏳ <date>` and `↩ <date>` in the human output.
  - [ ] 10.3 Add CLI tests through `runCli`:
    - A full morning: review, set, schedule, migrate, then `log show` on both days.
    - Each new error code and its exit code.
    - `--json` stdout always parses.
    - `--dry-run` writes nothing.
    - A missing config gives the `dibujo init` hint.
  - _Requirements: 1.6, 2.9, 4.1, 4.2_

- [ ] 11. Vault format document
  - [ ] 11.1 Update `docs/vault-format.md`:
    - Add a "Task fields" section covering the origin link, the scheduled date, and the block id, with the canonical order, the parsing rules, and why the block id comes last.
    - Add a "Migration" section covering `[>]`, what moves with a task, the link back, and how streaks are counted.
    - Update the example note, and "How dibujo writes to a note", which now edits checkbox characters and trailing fields.
  - [ ] 11.2 Extend `tests/docs/vault-format.test.ts` so the new example blocks parse to the expected bullets.
  - _Requirements: 6.1–6.4_

- [ ] 12. `morning-planning` skill
  - [ ] 12.1 Write `skills/morning-planning/SKILL.md` with the frontmatter and the steps from the design:
    - find the CLI;
    - review;
    - migration, including the flagged message and child tasks;
    - brain-dump, with the daily-log rules repeated in this skill;
    - priority;
    - confirm;
    - save, in order, with the retry rules;
    - report.

    Include the skipping rules, and link to `references/vault-format.md`.
  - [ ] 12.2 Install with `npm run dev -- skills install --target .kiro/skills`. Run a manual morning against a scratch vault with yesterday's note holding:
    - a task with nested children;
    - a task with a 3-day streak;
    - a task to schedule;
    - a task to cancel.

    Check:
    - each prompt and the flag message;
    - that skipping works;
    - the confirmation plan;
    - both notes on disk, including that the links open the right line in Obsidian;
    - that running the ritual a second time finds nothing left to review.
  - _Requirements: 5.1–5.12_

- [ ] 13. Final checks
  - [ ] 13.1 Update `.kiro/steering/structure.md` to list the `morning-planning` skill and the new `src/bujo/` and `src/vault/` modules.
  - [ ] 13.2 Run `npm run build` and `npm link`, then run `dibujo task review --json` and `dibujo task migrate --dry-run --json` against a scratch vault. Run `npm pack --dry-run` and confirm `skills/morning-planning/` is included.
  - _Requirements: 5.1_
