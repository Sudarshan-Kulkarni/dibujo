# Tasks: future log

Read `requirements.md` and `design.md` in this folder first. Each task says which design section to follow. The tasks build on each other, so do them in order unless a task lists its dependencies and they are done.

## Notes for whoever runs these tasks (including Kiro Web)

- **Node.** The project needs Node 22.12 or newer. Run `node --version` first. On Node 20 or older, vitest crashes when a test fails and hides the failure, so install Node 22 (for example `nvm install 22`) before anything else.
- **Commands.** `npm install`, then `npm run format`, `npm run check` (Biome and `tsc`), and `npm test` (runs once, never use watch mode). Every task ends with `npm run check` and `npm test` passing.
- **Conventions.** Follow `.kiro/steering/tech.md` and `structure.md`: TypeScript with ESM and `.js` import extensions, no `any`, named exports only, kebab-case file names, no new runtime dependencies. `src/bujo/` stays pure, with no filesystem access.
- **Follow the existing code.** Copy the patterns in `src/vault/tasks.ts` (`migrateTask`, `scheduleTask`), `src/bujo/migrate.ts`, `src/bujo/edit.ts`, and `tests/vault/tasks.test.ts` (the `vault()` and `ids()` helpers). If the design and the existing code disagree about daily notes, keep the existing behavior, and list the difference in the pull request.
- **Testing is limited on purpose.** Add only the tests each task asks for, which cover the core pieces: parsing and formatting, appending to the note, due entries, the scheduling and migration writes, and one end-to-end run. Don't add tests for `--dry-run` on every command, every error code, the wording of human output, or every option combination. Existing tests must keep passing. Fix existing tests that break because the behavior changed on purpose (task 7 changes `task schedule`), and don't weaken them.
- **Property tests** use `fast-check` (already installed). Build the arbitrary you need directly instead of filtering random values with `fc.pre`, because `fc.pre` makes fast-check give up when most cases are skipped. Helpers are in `tests/helpers/arbitraries.ts`.
- **Git.** Work on a branch and deliver a pull request. Use commit messages like `add: future log note logic`: a lowercase verb, a colon, and a short lowercase description with no period. Don't merge. Don't edit the spec files except to tick the checkboxes here. `.kiro/skills/` is gitignored, so don't touch it.
- **If you are blocked,** pick the simplest reading of the design, and say what you picked in the pull request description.

---

- [x] 1. Groundwork
  - [x] 1.1 Add `.nvmrc` containing `22`, so the sandbox and local shells pick a supported Node.
  - [x] 1.2 In `src/bujo/journal-date.ts`, add `daysBetween(from, to)`: the number of calendar days from one `YYYY-MM-DD` date to another, anchored at local noon like `addDays` so DST can't change the result. Add one test in `tests/bujo/journal-date.test.ts` covering a month end, a leap day, and a DST change day.
  - [x] 1.3 In `src/vault/paths.ts`, add `futureNotePath(config, year)`, returning `<vault>/<folder>/Future/<year>.md` through `resolveInVault`.
  - [x] 1.4 In `src/bujo/ref.ts`, add `formatFutureRef(year, line, fingerprint)` and `parseFutureRef(value)`. The shape is `YYYY:<line>:<8 hex>`, and anything else throws `INVALID_REF`. Make the hint of each parser mention the other kind when the value has the other kind's shape (for example, "this looks like a future log ref, use `dibujo future ...`"). `parseRef` itself must keep its current behavior. Add one `fast-check` round-trip test for future refs in `tests/bujo/ref.test.ts`.
  - [x] 1.5 In `src/vault/daily.ts`, change `assertSupported` to accept anything with a `version: number | null`, not just `ParsedNote`.
  - _Requirements: 4.9, 6.1_

- [x] 2. Origin links to the future log
  - _Depends on: 1_
  - [x] 2.1 In `src/bujo/types.ts`, replace `Origin` with `DailyOrigin { date; blockId }`, `FutureOrigin { year; blockId }`, and `Origin = DailyOrigin | FutureOrigin`. See "Links" in the design.
  - [x] 2.2 In `src/bujo/bullet.ts`:
    - Change `TRAILING_ORIGIN` to the pattern in the design. A key of `YYYY-MM-DD` is a daily link, and its path must be empty or end in `Daily/`. A key of `YYYY` is a future link, and its path must be empty or end in `Future/`. Anything else stays in the text.
    - Make `formatOriginLink` write both forms. Daily keeps `[[<folder>/Daily/<date>#^<id>|from <date>]]`. Future writes `[[<folder>/Future/<year>#^<id>|from future log <year>]]`. Without a folder, both use the file name only.
    - Make `fingerprint()` use `{ date, blockId }` for a daily origin, exactly as now, and `{ year, blockId }` for a future origin.
  - [x] 2.3 Fix every place that reads `origin.date`, using `"date" in origin` to narrow:
    - `src/vault/tasks.ts`: the `alreadyCopied` check in `migrateTask`, and `migrationStreak`. A future origin ends a streak, like a link to any day other than the day before.
    - `src/cli/bullet-symbols.ts`: show `↩ future log <year>` for a future origin.
  - [x] 2.4 Tests (core only):
    - Before changing `fingerprint`, compute it for `{ type: "task", depth: 0, text: "call the bank", signifiers: ["priority"], origin: { date: "2026-11-08", blockId: "k3f9a1" } }` with the current code, and pin the result in a test. This proves existing daily refs don't change.
    - In `tests/bujo/bullet.test.ts`, add a small table of origin links: full path, basename only, with and without an alias, for both kinds. Include `[[Books/2026#^abc]]` and `[[Bujo/Daily/2026#^abc]]` (a year key in a `Daily/` path), which must both stay in the text.
    - Extend `tests/helpers/arbitraries.ts` so generated task bullets can have either origin kind, and let the existing round-trip property in `tests/bujo/bullet.property.test.ts` cover them.
  - _Requirements: 1.8_

- [ ] 3. Share the note helpers (no behavior change)
  - _Depends on: 1_
  - [ ] 3.1 In `src/bujo/note.ts`, export `findFrontmatterEnd` and `readVersion` (make `readVersion` take the frontmatter end instead of the daily `Layout`). Add an exported function that lists the `## ` headings outside code fences, with their line index and name. Replace `appendToSection` with a function that takes a section range (`insertIntoRange(lines, range, addition, separate)`), and make `appendCapture` and `appendLogLines` use it.
  - [ ] 3.2 No new tests. All existing tests must pass unchanged, which proves daily notes behave the same.
  - _Requirements: 6.2_

- [ ] 4. Future log note logic (pure)
  - _Depends on: 2, 3_
  - [ ] 4.1 Create `src/bujo/future.ts`. Follow "Pure logic" in the design.
    - `monthHeading("2026-12")` returns `## 2026-12 December`. Use a fixed list of English month names.
    - `newFutureTemplate(year)` writes the frontmatter (`dibujo`, `type: future`, `year`) and the 12 month sections.
    - `parseFutureNote(content)` returns `{ version, entries, unrecognized }`. An entry is a bullet under a `## YYYY-MM …` heading, and it gets a `month` and its 1-based `line`. Non-bullet lines in a month section are unrecognized. Everything outside month sections is ignored.
    - `appendFutureEntries(original, month, lines)` appends after the last non-blank line of the month's section. When the section is missing, it adds the heading in calendar order. It checks that every original line is still there, in order, as `appendCapture` does.
    - `dueEntries(entries, today)` keeps task entries in state open with a `⏳` date on or before today, sorted by date and then by position.
    - `findLive(entries, from)` finds the live entry for an origin, as described in "Scheduling a task". It returns `{ kind: "waiting" | "resume", entry }` or `null`, and uses a visited set against loops.
  - [ ] 4.2 Tests in `tests/bujo/future.test.ts` (core only):
    - The template has 12 months in order, and parses as an empty note.
    - Parsing reads entries per month and reports an unrecognized line.
    - Appending to a missing month inserts its heading in calendar order.
    - A property: appending to a generated note keeps every original line in order, and keeps the month headings in calendar order.
    - A property: `dueEntries` returns an entry exactly when it is a waiting, dated task on or before today.
    - `findLive` over four cases: no entry, a waiting entry, a rescheduled chain ending in a waiting entry, and an interrupted reschedule.
  - _Requirements: 1.1 to 1.7, 1.9, 3.5, 3.6_

- [ ] 5. Reading the future log (vault layer)
  - _Depends on: 4_
  - [ ] 5.1 Create `src/vault/write-plan.ts` with `commitWrites(writes, options)`. A write is `{ path, original: string | null, content, hooks? }`. A write with `original === null` goes through `writeNew`, a changed one through `replaceIfUnchanged`, and an unchanged one is skipped. Return each note's status (`created`, `updated`, or `unchanged`). Add an optional `afterWrite(index)` callback that only tests use, to simulate a crash between writes.
  - [ ] 5.2 Create `src/vault/future.ts` with:
    - `loadFutureNotes(config, { throughYear? })`: list `<folder>/Future/`, keep names that match `YYYY.md`, read and parse each one, and call `assertSupported`. A missing folder gives an empty list. An unsupported note throws `NOTE_VERSION_UNSUPPORTED` naming its path.
    - `readFutureNote(config, year)`: the view for `future show`, with `exists`, `path`, `year`, the months that have entries, each entry with its `ref` (`formatFutureRef` plus `fingerprint`), and the unrecognized lines.
    - `dueEntriesFor(config, today)`: load the notes for today's year and every earlier year, run `dueEntries`, and return each entry with `ref`, `text`, `signifiers`, `scheduled`, `daysOverdue` (using `daysBetween`), `scheduledFrom`, and `path`. `scheduledFrom` follows future origins across the loaded notes to a daily origin, with a visited set, and is `null` when the chain breaks.
  - [ ] 5.3 One test in `tests/vault/future.test.ts`: with notes for 2025 and 2026, an entry dated 2025-12-30 and one dated 2026-01-02, plus a future-dated entry, an undated entry, and a handled entry, `dueEntriesFor` returns only the two overdue ones, in date order. The same two come back again for a later "today" until one of them is marked handled in the file.
  - _Requirements: 3.1 to 3.9_

- [ ] 6. Handling entries: migrate, reschedule, cancel
  - _Depends on: 5_
  - [ ] 6.1 In `src/vault/future.ts`, add `resolveEntryRef(config, ref)`. It resolves like `resolveRef` for daily tasks: by line and fingerprint first, then by the one entry with that fingerprint, otherwise `TASK_NOT_FOUND`. It throws `NOT_A_TASK` for an event or a note.
  - [ ] 6.2 Add `migrateEntry(config, ref, { to, priority, dryRun, now, hooks, newId })`. Follow "Migrate to a daily log" in the design:
    - Check every note that will be written, including the target daily note, before the first write.
    - Write the future log first (the entry becomes `[>]` and gets a block id), then the daily note (an open task with a future origin link, the entry's text and signifiers, no `⏳` date, plus `priority` with `priority`).
    - The target defaults to today's journal date and must be today or later.
    - Accept a waiting entry, or one that is `[>]` with a block id (a resumed run). Skip the target write when a task with that origin already exists.
  - [ ] 6.3 Add `planReschedule(...)`, which returns the planned writes, and `rescheduleEntry(config, ref, date, options)`, which runs them. Follow "Reschedule" in the design: the old entry becomes `[<]` with a block id, and a new waiting entry with a future link to it goes in the new date's month. For the same year, put both changes in one write. For a different year, write the old note first. The new date must be later than today. Accept a waiting entry, or a `[<]` entry with a block id and no copy (a resumed run). If a copy already exists, report `unchanged`. `planReschedule` is separate so `scheduleTask` can reuse it in task 7.
  - [ ] 6.4 Add `cancelEntry(config, ref, options)`: a waiting entry becomes `[-]`, a cancelled one is `unchanged`, and anything else is `TASK_NOT_OPEN`.
  - [ ] 6.5 Refuse before writing when `config.folder` contains `[`, `]`, `|`, `#`, or `^`, with `CONFIG_INVALID`, as `migrateTask` does.
  - [ ] 6.6 Tests in `tests/vault/future.test.ts` (core only):
    - `migrateEntry` into a new daily note, then the same call again: both notes unchanged the second time.
    - `migrateEntry` interrupted after the future log write (use `commitWrites`'s `afterWrite`), then run again: one copy only.
    - `rescheduleEntry` in the same year, and across years with an interruption after the first write and a rerun that adds exactly one new entry.
    - A returned task has a streak of 0 in `reviewTasks` the next day.
    - A property: running `migrateEntry` or `rescheduleEntry` twice leaves the same files as running it once, for generated waiting entries.
  - _Requirements: 4.1 to 4.10_

- [ ] 7. Scheduling also writes the future log
  - _Depends on: 6_
  - [ ] 7.1 Change `scheduleTask` in `src/vault/tasks.ts`, following "Scheduling a task" in the design.
    - The daily edit is the existing one plus a block id, using `addBlockId` and reusing an existing id.
    - Load all future log notes with `loadFutureNotes`, and find the live entry with `findLive`. Then do the case that matches:

      | Live entry | Write |
      | --- | --- |
      | none, or all handled | append a new waiting entry linked to the daily task |
      | waiting, same date | nothing in the future log |
      | waiting, different date | `planReschedule` for it |
      | a `[<]` entry with no copy | append the new entry linked to that entry |

    - Check every note's version before the first write. Write the daily note first, then the future log, using `commitWrites`.
    - The result gets a `future` field: `{ path, year, action: "added" | "rescheduled" | "unchanged", status }`. A dry run also returns `futureContent`. Keep the existing fields.
    - Accept an optional `newId` option for tests, with `randomBlockId` as the default.
  - [ ] 7.2 Fix the existing scheduling tests in `tests/vault/tasks.test.ts` and `tests/cli/task.test.ts` that assumed only the daily note changes.
  - [ ] 7.3 Tests in `tests/vault/tasks.test.ts` (core only):
    - Scheduling a task creates the future note with the entry in the right month, the daily task has a block id, and the entry's link points at it.
    - Scheduling the same task and date again changes nothing.
    - A task that was scheduled before this spec (`[<] ⏳ date`, no entry) gets its entry on a rerun, and the daily note is reported unchanged.
    - Scheduling again for a different date reschedules the entry.
    - An unsupported future log version fails before the daily note is written.
    - An interruption between the two writes is finished by a rerun, without a second entry.
  - _Requirements: 2.1 to 2.10_

- [ ] 8. CLI commands
  - _Depends on: 7_
  - [ ] 8.1 Create the `future` group in `src/cli/future.ts`, with one file per command, in the style of the `task` commands: `future-show.ts` (`--year`, `--json`), `future-due.ts` (`--date`, `--json`), `future-migrate.ts` (`<ref>`, `--to`, `--priority`, `--dry-run`, `--json`), `future-reschedule.ts` (`<ref> <date>`, `--dry-run`, `--json`), and `future-cancel.ts` (`<ref>`, `--dry-run`, `--json`). Use the JSON shapes in "CLI" in the design. Register the group in `src/cli/registers.ts`.
  - [ ] 8.2 Update `src/cli/task-schedule.ts` to print the future log result (human and JSON), and update the `--help` text of `task schedule` to say that it also writes the future log.
  - [ ] 8.3 Human output uses the existing symbols. A due entry shows `⏳ <date>` and `(<n> days overdue)`.
  - [ ] 8.4 One end-to-end test in `tests/cli/future.test.ts`, in the style of `tests/cli/task.test.ts`. Run `task schedule` on three tasks, move the clock past their dates, and check that `future due --json` lists them. Then run `future migrate`, `future reschedule`, and `future cancel`, one on each. Check that `future due` is empty afterward, that `future show --json` shows the right states, and that `log show --json` for today lists the migrated task with a future origin. Every `--json` output must parse. In the same file, check that giving a daily ref to `future cancel` exits with code 2.
  - _Requirements: 3, 4, 2.9_

- [ ] 9. Vault format document
  - _Depends on: 8. Can run at the same time as task 10._
  - [ ] 9.1 Update `docs/vault-format.md`:
    - Add a "Future log" section: the location, the frontmatter, the month headings, the entry states, and how a due entry is decided (the `⏳` date, not the section).
    - Document the future link form next to the daily form, and the field order.
    - Update "Migration" or add a short section on how scheduling and coming back work.
    - Add a warning that renaming the dibujo folder outside Obsidian breaks both kinds of links.
    - Update "How dibujo writes to a note" and "Versioning" to cover the future log and say the version stays 1.
  - [ ] 9.2 In `tests/docs/vault-format.test.ts`, add one test that parses the future log example from the document and checks that its daily-to-future and future-to-daily links point at each other's block ids.
  - _Requirements: 6.1 to 6.3_

- [ ] 10. Update the `morning-planning` skill
  - _Depends on: 8. Can run at the same time as task 9._
  - [ ] 10.1 Edit `skills/morning-planning/SKILL.md`, following "The `morning-planning` skill" in the design:
    - Add the due-entries step after migration, with the choice table, the neutral overdue wording, and "leave" meaning the entry comes back tomorrow.
    - Renumber the steps. Update the opening sentence, the priority step (`--priority` for entries brought in), the confirmation example (a "Future log" section), the save order, the brain-dump duplicate rule, and the report step.
    - Say in the migration step that scheduling also writes the future log.
  - [ ] 10.2 Keep the frontmatter to `name` and `description`, and update the `description` to mention scheduled tasks coming back. Don't restate the note format. Keep linking to `references/vault-format.md`.
  - _Requirements: 5.1 to 5.10_

- [ ] 11. Final checks
  - _Depends on: 9, 10_
  - [ ] 11.1 Update `.kiro/steering/structure.md`: list the new `src/bujo/` and `src/vault/` modules and the `Future/` note location.
  - [ ] 11.2 Run `npm run format`, `npm run check`, and `npm test`. Then run `npm run build` and `npm pack --dry-run`, and confirm the output includes `dist/cli/future-*.js` and `skills/morning-planning/SKILL.md`.
  - [ ] 11.3 With a scratch vault (`DIBUJO_VAULT_PATH` pointing at a temporary folder, and `XDG_CONFIG_HOME` at another), run the built CLI: `task schedule` on a task, `future show`, `future due --date <the task's date>`, `future migrate`, and `log show`. Confirm each exits with code 0 and prints valid JSON with `--json`.
  - _Requirements: 6.3_

## For the user, after the pull request (not for the agent)

These checks need Obsidian or a real agent session, which a cloud sandbox doesn't have.

- [ ] A. Run `npm run build && dibujo skills install` (or `npm run dev -- skills install --target .kiro/skills` in the repo) so the updated skill is installed.
- [ ] B. In Obsidian, open a daily note with a scheduled task. Click its link in the future log entry, and check that it opens the original task. Check that the daily note shows the future log in its backlinks pane.
- [ ] C. Click the "from future log 2026" link in a daily task that came back from the future log, and check that it opens the entry.
- [ ] D. Run "plan my morning" with a due entry in the future log. Check each choice (bring in, push, cancel, leave), then run it again the next morning and check that the entries you left are offered again.
- [ ] E. Check that the Tasks plugin, if you use it, shows the `⏳` dates on future log entries.
