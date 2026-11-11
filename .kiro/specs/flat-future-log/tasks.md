# Tasks: flat future log

Read `requirements.md` and `design.md` in this folder first. Each task says which design section to follow. The tasks build on each other, so do them in order.

## Notes for whoever runs these tasks (including Kiro Web)

- **Node.** The project needs Node 22.12 or newer. Run `node --version` first. On Node 20 or older, vitest crashes when a test fails and hides the failure, so install Node 22 (for example `nvm install 22`) before anything else.
- **Commands.** `npm install`, then `npm run format`, `npm run check` (Biome and `tsc`), and `npm test` (runs once, never use watch mode).
- **Tasks 1 to 4 are one change.** They replace the year-based future log, and the shared types change in task 1, so the old files stop compiling until the CLI is updated in task 4. While you work through them, check only the layer you are in (`npx tsc --noEmit` and `npx vitest --run tests/bujo`, then `tests/vault`). **`npm run check` and `npm test` must both pass in full at the end of task 4**, and at the end of every task after it.
- **Conventions.** Follow `.kiro/steering/tech.md` and `structure.md`: TypeScript with ESM and `.js` import extensions, no `any`, named exports only, kebab-case file names, no new runtime dependencies. `src/bujo/` stays pure, with no filesystem access.
- **Follow the existing code.** Copy the patterns in `src/vault/tasks.ts` (`migrateTask`, `scheduleTask`), `src/vault/future.ts` (the current `migrateEntry` and `cancelEntry`, which are mostly kept), `src/bujo/edit.ts`, `src/cli/log-add.ts` (the template for `future add`), and `tests/vault/tasks.test.ts` (the `vault()` and `ids()` helpers). If the design and the existing code disagree about daily notes, keep the existing behavior, and list the difference in the pull request.
- **Testing is limited on purpose.** Add only the tests each task asks for, which cover the core pieces: parsing and formatting, appending to the note, adding and importing, the scheduling and migration writes, and one end-to-end run. Don't add tests for `--dry-run` on every command, every error code, the wording of human output, or every option combination. **Delete tests of the old year-based design instead of porting them.** Tests of daily-note behavior must keep passing unchanged.
- **Property tests** use `fast-check` (already installed). Build the arbitrary you need directly instead of filtering random values with `fc.pre`. Helpers are in `tests/helpers/arbitraries.ts`.
- **Git.** Work on a branch and deliver a pull request. Use commit messages like `add: flat future log note logic`: a lowercase verb, a colon, and a short lowercase description with no period. Don't merge. Don't edit the spec files except to tick the checkboxes here. `.kiro/skills/` is gitignored, so don't touch it.
- **Don't touch a real vault.** Use temporary directories, and a scratch vault for the walkthrough in task 7. Never run `dibujo future import` or any other writing command against a vault you didn't create.
- **If you are blocked,** pick the simplest reading of the design, and say what you picked in the pull request description.

---

- [x] 1. Pure logic
  - [x] 1.1 `src/bujo/types.ts`, `bullet.ts`, `capture.ts`. Follow "Fields on a line" and "Links" in the design.
    - Add `eventDate?: string` to `Bullet`. Change `FutureOrigin` to `{ blockId: string; year?: string }`.
    - Add `TRAILING_EVENT_DATE` (`📅` with an optional variation selector, then `YYYY-MM-DD`). Make `splitFields` take the bullet type: `⏳` and the origin link are read on tasks only, and `📅` on events only. On other types, they stay in the text.
    - Make `formatBullet` write `📅 <date>` for an event, in the same slot as `⏳` (after the tags, before the block id).
    - Change `TRAILING_ORIGIN` to capture the whole link target, and classify it in a new `originFrom(target, blockId)` using the table in the design. Daily and future links need the target and folder to agree. Other links stay in the text.
    - Make `formatOriginLink` write the new future form (`[[<folder>/Future#^id|from future log]]`, or `[[Future#^id|…]]` without a folder). It never writes a year.
    - `fingerprint()`: a daily origin hashes exactly as now. A future origin hashes as `{ blockId }`. The event date is not part of the fingerprint.
    - `capture.ts`: `BulletText` also rejects text containing `📅`.
    - `src/cli/bullet-symbols.ts`: print `future log` without a year, and a `📅` suffix for event dates.
  - [x] 1.2 `src/bujo/ref.ts`. `FutureRef` becomes `{ line, fingerprint }`, in the shape `<line>:<8 hex>`. `parseFutureRef` rejects the daily shape and the old three-part year shape with `INVALID_REF`, and its hint says to run `dibujo future show` or `dibujo future due` for fresh refs. `parseRef` keeps its behavior, and its hint points to the future shape when the value has it.
  - [x] 1.3 `src/bujo/future.ts`. Rewrite it as in "Pure logic" in the design: `newFutureTemplate()`, `parseFutureNote`, `appendFutureEntries`, `dueEntries`, `eventsOn`, `otherWaiting`. Delete the month and year code, `findLive`, and the `LocatedEntry` and `LiveEntry` types.
    - `parseFutureNote` skips the frontmatter, blank lines, and Markdown headings, and turns each bullet into an entry with its line number. Other lines are unrecognized.
    - `appendFutureEntries(original, lines)` appends after the last non-blank line, adds a blank line only after the end of the frontmatter, keeps the line ending style, and checks that every original line is still there in order (`isSubsequence`).
    - Reuse `findFrontmatterEnd`, `readVersion`, `splitLines`, `lastNonBlank`, and `isSubsequence` from `src/bujo/note.ts`. Export what you need.
  - [x] 1.4 `src/bujo/future-input.ts` (new). Follow "future-input.ts" in the design: the zod schemas, `parseFutureAdd`, and `planAdd` (past dates, notes with dates, and duplicates).
  - [x] 1.5 `src/bujo/future-import.ts` (new). Follow "future-import.ts" in the design: `planImport` with its six rules (what is copied, flattening origins, block ids, already imported, how lines are copied, unreadable lines).
  - [x] 1.6 Tests (core only):
    - `tests/bujo/bullet.test.ts`: `📅` is read on an event and stays in the text on a task and a note; the three origin forms read as the table says, including a link whose target and folder disagree (`[[Books/Future#^abc]]`, `[[Bujo/Daily/2026#^abc]]`), which must stay in the text; a future origin is written without a year; an old-form and a new-form link give the same fingerprint. Keep the existing test that pins the fingerprint of a daily origin.
    - `tests/helpers/arbitraries.ts` and `tests/bujo/bullet.property.test.ts`: generated bullets can be events with a date, and tasks with either origin kind. The existing round-trip property must still hold.
    - `tests/bujo/ref.test.ts`: replace the old future-ref tests with a round trip for `<line>:<fingerprint>` and rejection of the daily and year-form shapes.
    - `tests/bujo/future.test.ts` (rewrite): parsing with headings, nesting, and an unrecognized line; appending with the blank line after the frontmatter, and a property that appending keeps every original line in order; `dueEntries`, `eventsOn`, and `otherWaiting` on a small table.
    - `tests/bujo/future-input.test.ts` (new): valid input, a past date, a note with a date, a duplicate of an existing entry, a duplicate within the input.
    - `tests/bujo/future-import.test.ts` (new): copies open tasks, events, and notes and skips other states; flattens a two-step chain to its daily origin; keeps the link when the chain is broken; drops a colliding block id; finds entries under a `## December` heading; running the plan again against its own output adds nothing, even when an imported entry has since been brought in.
  - _Requirements: 1.3 to 1.8, 2.1 to 2.7, 4.2 to 4.5, 7.1 to 7.4, 9.7, 9.8_

- [x] 2. Vault layer
  - _Depends on: 1_
  - [x] 2.1 `src/vault/paths.ts`: `futureNotePath(config)` returns `Future.md` in the dibujo folder. Add `legacyFutureNotePaths(config)`, which lists `Future/YYYY.md`, oldest year first, and gives an empty list when the folder is missing.
  - [x] 2.2 `src/vault/future.ts`: rewrite it as in "Vault operations" in the design. Keep the code of the current `migrateEntry` and `cancelEntry` where it still applies.
    - `loadFutureNote`, `resolveEntry` (by line and fingerprint, then by a unique fingerprint, else `TASK_NOT_FOUND`; `NOT_A_TASK` for events and notes), `showFuture`, and `dueFor`, which returns `entries`, `events`, `waiting`, and `legacyNotes`. `scheduledFrom` is the origin date of an entry with a daily origin, and `null` otherwise.
    - `addEntries` (loads or starts the note, runs `planAdd`, appends, writes; the result lists the entries added with their refs, and the number skipped).
    - `migrateEntry`: the entry becomes `[>]` with a block id, written first, and the daily copy has the future origin `{ blockId }`. A copy that already exists is found by that origin, so a rerun adds nothing.
    - `rescheduleEntry`: the entry must be open and the date later than today. Set or change the date in place with `setScheduled` and `applyLineEdits`. The same date is `unchanged`.
    - `cancelEntry`: as today, without the year.
    - `importOldNotes` and `legacyNotesToImport`, using `planImport`. An unsupported old note stops `importOldNotes` with `NOTE_VERSION_UNSUPPORTED`, and is ignored by `legacyNotesToImport`.
    - Delete everything else in the file that is year-based.
  - [x] 2.3 Tests in `tests/vault/future.test.ts` (rewrite, and use the `vault()` and `ids()` helpers):
    - `addEntries` creates the note, appends in order, and a second identical run adds nothing.
    - `dueFor` returns the due entries, the events dated today, and the other waiting tasks, and leaves out brought-in and cancelled entries.
    - `migrateEntry` adds a daily copy with a link back, and a rerun after an interruption (use the write hook) adds no second copy.
    - `rescheduleEntry` changes only the date and refuses an entry that is not open.
    - `importOldNotes` against a temporary vault with two old year notes: copies what it should, leaves the old notes byte for byte the same, and a second run adds nothing.
  - _Requirements: 1.9, 4.1 to 4.8, 5.1 to 5.9, 6.1 to 6.10, 9.7, 9.8_

- [x] 3. Scheduling
  - _Depends on: 2_
  - [x] 3.1 `src/vault/tasks.ts`: change `scheduleTask(config, ref, date?, options)` as in "scheduleTask" in the design. Look the entry up by the daily task's origin, and follow the table: add, change the date in place, or leave the future log alone. The result's `future` field loses `year`. Drop the chain-walking and month imports. A future origin must still end a migration streak in `migrationStreak`.
  - [x] 3.2 Tests: rewrite the future log tests in `tests/vault/tasks.test.ts` (the `describe` block about scheduling and the future log). Cover one case for each row of the table, a schedule with no date, scheduling again with a different date (both dates change and there is still one entry), and an interrupted run finished by running the same command again. Leave the other tests in the file alone.
  - _Requirements: 3.1 to 3.10_

- [x] 4. CLI
  - _Depends on: 3_
  - [x] 4.1 New commands in `src/cli/`, registered in `registers.ts`:
    - `future-add.ts`: JSON on stdin like `log-add.ts`, including the `USAGE` error when stdin is a terminal. Options `--dry-run` and `--json`.
    - `future-import.ts`: `--dry-run` and `--json`. Plain output says how many entries were copied from which notes and lists any unreadable lines.
  - [x] 4.2 Update the existing commands to the new results (see "JSON changes" in the design): `future-show.ts` (no year argument), `future-due.ts` (print the events and the other waiting tasks, and a line about `legacyNotes` when there are any), `future-migrate.ts`, `future-reschedule.ts` (the date is in place and the result is `{ ref, path, scheduled, status }`), `future-cancel.ts`, and `task-schedule.ts` (`<date>` becomes optional). Update the help text of each to match.
  - [x] 4.3 Delete the tests of the old design in `tests/cli/` and `tests/docs/` that no longer apply, and rewrite `tests/cli/future.test.ts` as one run through: `future add`, `task schedule` with and without a date, `future due`, `future migrate`, `future reschedule`, `future cancel`, and `future import`, with `--json` and a fake context. Fix `tests/cli/task.test.ts` for the new `task schedule` result.
  - [x] 4.4 `npm run format`, `npm run check`, and `npm test` pass in full.
  - _Requirements: 2.2, 3.1, 4.1, 5.1, 5.3, 5.5, 6.1 to 6.3, 9.7_

- [x] 5. Vault format document
  - _Depends on: 4_
  - [x] 5.1 Update `docs/vault-format.md` as listed in "Format document" in the design. Keep the examples consistent with the CLI: they are parsed by `tests/docs/vault-format.test.ts`.
  - [x] 5.2 Update `tests/docs/vault-format.test.ts` for the new examples: the future log example parses with the flat parser, and its links agree. Remove the checks for months.
  - _Requirements: 10.1 to 10.3_

- [x] 6. Skills
  - _Depends on: 5_
  - [x] 6.1 Create `skills/future-log/SKILL.md` as in "future-log (new)" in the design. Frontmatter has only `name` and `description`. Link to `references/vault-format.md`. Every command uses the installed `dibujo ... --json`, with the same `npx -y digi-bujo` fallback as the other skills. Use a quoted heredoc for the JSON on stdin.
  - [x] 6.2 Update `skills/morning-planning/SKILL.md` as in "morning-planning" in the design: the new step order, the optional date when scheduling, today's events, the "look at your future log" step, priority for picked tasks, and the new `future reschedule` result fields. Keep the rest of the skill as it is.
  - [x] 6.3 Update `skills/daily-log/SKILL.md` and `skills/morning-planning/SKILL.md` with the rule that the future log is changed only through `dibujo` commands and that requests to add to it use the `future-log` skill.
  - [x] 6.4 In `README.md`, add one line to "Set up" about the future log (`dibujo future import` if you used the earlier version). Don't add anything else.
  - _Requirements: 8.1 to 8.11, 9.1 to 9.6, 9.9, 10.5_

- [x] 7. Wrap-up
  - _Depends on: 6_
  - [x] 7.1 `npm run format`, `npm run check`, `npm test`, and `npm run build` pass. `npm pack --dry-run` lists `skills/future-log/SKILL.md`.
  - [x] 7.2 Run the CLI from `dist/` against a **scratch vault in a temporary directory** (never a real vault). Put an old-style `Future/2026.md` in it, with month headings and a rescheduled chain, and a hand-written `## December` section. Then: `future show` (check `legacyNotes`), `future import --dry-run`, `future import`, `future import` again (nothing added), `future add` with a dated event, an undated task, and a note, `task schedule` with and without a date, `future due --date <later day>`, `future migrate`, `future reschedule`, `future cancel`. Note in the pull request anything that behaved differently from the design.
  - [x] 7.3 Remove the scratch vault and any temporary files.
  - [x] 7.4 In the pull request description, list the `--json` changes from the design, and say that `dibujo skills install` must be run after updating.

---

## Manual checks (for the author, after merging)

These need Obsidian and a real agent, so the task runner can't tick them.

- [x] A. Run `npm run build`, `npm link`, and `dibujo skills install`. Then run `dibujo future show --json` against your vault and check that `legacyNotes` lists `Future/2026.md`. Run `dibujo future import --dry-run`, then `dibujo future import`, and check that your three tasks are in `Future.md`.
- [x] B. In Obsidian, click an origin link that points to the future log (`[[Bujo/Future#^id|from future log]]`). It should open `Future.md`, even with the old `Future/` folder next to it, and `Future.md` should show the daily task in its backlinks.
- [x] C. In a new agent session, say "put the dentist on Dec 12 on my future log" and "add learn Rust to my future log". The agent should use the `future-log` skill and `dibujo future add`, and not edit any file.
- [x] D. Run morning planning in a real agent with a due entry, a few undated tasks, and an event dated today. Check that it asks about the due entry, mentions the event, asks "Would you like to take a look at your future log?", and brings in the tasks you pick.
