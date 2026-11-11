# Tasks: monthly migration

Read `requirements.md` and `design.md` in this folder first. Each task says which design section to follow. The tasks build on each other, so do them in order unless a task lists its dependencies and they are done.

## Notes for whoever runs these tasks (including Kiro Web)

- **Node.** The project needs Node 22.12 or newer. Run `node --version` first. On Node 20 or older, vitest crashes when a test fails and hides the failure, so install Node 22 (for example `nvm install 22`, `.nvmrc` has the version) before anything else.
- **Commands.** `npm install`, then `npm run format`, `npm run check` (Biome and `tsc`), and `npm test` (runs once, never use watch mode). Every task ends with `npm run check` and `npm test` passing.
- **Conventions.** Follow `.kiro/steering/tech.md` and `structure.md`: TypeScript with ESM and `.js` import extensions, no `any`, named exports only, kebab-case file names, no new runtime dependencies. `src/bujo/` stays pure, with no filesystem access. Every vault path goes through `resolveInVault`, and every write through `src/vault/atomic-write.ts`.
- **Follow the existing code.** Copy the patterns in `src/vault/tasks.ts` (`reviewTasks`, `migrationStreak`), `src/vault/future.ts`, `src/bujo/future-input.ts` (zod input), `src/cli/log-add.ts` and `src/cli/future-add.ts` (stdin), `src/cli/task-review.ts` (`--date`), and `tests/vault/tasks.test.ts` (the `vault()` and `ids()` helpers). If the design and the existing code disagree, keep the existing behavior, and list the difference in the pull request.
- **Testing is limited on purpose.** Add only the tests each task asks for. Don't add tests for `--dry-run` on every command, every error code, the wording of human output, or every option combination. Existing tests must keep passing and must not be weakened.
- **Property tests** use `fast-check` (already installed). Build the arbitrary you need directly instead of filtering with `fc.pre`. Helpers are in `tests/helpers/arbitraries.ts`.
- **Git.** Work on a branch and deliver a pull request. Use commit messages like `add: monthly note logic`: a lowercase verb, a colon, and a short lowercase description with no period. Don't merge. Don't edit the spec files except to tick the checkboxes here. `.kiro/skills/` is gitignored, so don't touch it.
- **If you are blocked,** pick the simplest reading of the design, and say what you picked in the pull request description.

---

- [x] 1. Groundwork
  - [x] 1.1 In `src/bujo/journal-date.ts`, add `monthOf`, `previousMonth`, `parseMonthArg`, `monthName`, and `isDateInMonth`, as in "Pure logic" in the design. `parseMonthArg` accepts only `YYYY-MM` with a month from 01 to 12 and throws `INVALID_DATE` otherwise, with a hint like `parseDateArg`'s. `monthName` uses a fixed list of English names.
  - [x] 1.2 In `src/vault/paths.ts`, add `monthlyNotePath(config, month)` (`Monthly/YYYY-MM.md`) and `dailyNoteDatesIn(config, month)`, as in "Vault operations" in the design. A missing `Daily/` folder gives an empty list. Names that aren't real dates are ignored.
  - [x] 1.3 In `src/errors.ts`, add the runtime code `SUMMARY_EXISTS`.
  - [x] 1.4 Tests in `tests/bujo/journal-date.test.ts`: `monthOf`, `previousMonth` across a year boundary, `parseMonthArg` with a good value, a bad shape, and month 13, and `monthName`.
  - _Requirements: 1.1, 1.2, 5.1, 6.6_

- [ ] 2. Counts and moving tasks (pure)
  - _Depends on: 1_
  - [ ] 2.1 Create `src/bujo/month.ts` with `countTasks` and `movingTasks`. Follow "Moving tasks" in the design step by step: the index, the predecessor rules for daily and future origins, heads, the walk with a visited set, counting moves (the head included), leaving out chains whose head is nested under a task, the threshold, and the sort order.
  - [ ] 2.2 Tests in `tests/bujo/month.test.ts` (core only):
    - `countTasks` counts nested tasks, and a task migrated twice and then completed counts once as completed.
    - `movingTasks`: a chain over days that aren't in a row; exactly at the threshold and one below; a trip through the future log (`[<]` daily task, `[>]` future entry, copy with a future origin) joining one chain; a move in from the month before not counted; a head migrated out on the last day counted; a nested child task left out; a broken link ending the chain; a hand-made loop not hanging.
    - A property: for generated months, no moving task has more `moves` than there are task lines in the month, and each chain is listed once.
  - _Requirements: 4.1 to 4.6_

- [ ] 3. Monthly note logic (pure)
  - _Depends on: 2_
  - [ ] 3.1 Create `src/bujo/monthly-note.ts` with `SummaryInput`, `parseSummaryInput`, `newMonthlyTemplate`, `renderSummary`, `hasSummary`, `appendSummary`, and `containsBlock`. Follow "The monthly note", "Recognizing a summary", and "`src/bujo/monthly-note.ts`" in the design. Reuse `BulletText` from `capture.ts`, `formatIssues` for errors, and `listHeadings`, `splitLines`, `lastNonBlank`, and `isSubsequence` from `note.ts`. `newMonthlyTemplate` writes the frontmatter `dibujo`, `type: monthly`, and `month`.
  - [ ] 3.2 Tests in `tests/bujo/monthly-note.test.ts` (core only):
    - `renderSummary` with every section filled, and with every section empty (the empty-section lines, `0` tasks done, the threshold in the moving line). Compare against the example in the design.
    - `hasSummary`: true with a renamed title, false for a note with only other headings, false when the headings are in a code fence.
    - `parseSummaryInput` rejects an unknown field, a multi-line item, and more than 10 items.
    - A property: `appendSummary` keeps every original line in order, for generated notes.
  - _Requirements: 5.2 to 5.5, 6.3_

- [ ] 4. Reading a month and the pending check (vault layer)
  - _Depends on: 3_
  - [ ] 4.1 In `src/vault/tasks.ts`, split `openTasksIn(parsed, date, loadNote, flagAfterDays)` out of `reviewTasks`, as in the design. `reviewTasks` must return exactly what it does now. The existing tests prove it.
  - [ ] 4.2 Create `src/vault/month.ts` with `readMonth` and `pendingMonth`. Follow "`readMonth`" and "`pendingMonth`" in the design: refuse a month that isn't over, skip notes with an unsupported version into `skipped`, list leftovers oldest note first with their date and path, load `Future.md` for the chains (and build them without it if its version is unsupported), and report the summary state. `pendingMonth` never throws.
  - [ ] 4.3 Add `pendingMonth` to `ReviewResult` in `reviewTasks`, from `pendingMonth(config, today)`.
  - [ ] 4.4 Tests in `tests/vault/month.test.ts` (core only):
    - `readMonth` on a month with three notes: leftovers in order with children, a note with `dibujo: 99` in `skipped` and left out of the counts, and the month of today refused with `INVALID_DATE`.
    - `pendingMonth`: null with no notes in the past month, the month when there are notes and no monthly note, null once the monthly note has a summary, and null (no throw) when the monthly note has `dibujo: 99`.
  - _Requirements: 1.1 to 1.6, 2.1 to 2.3, 7.1 to 7.4_

- [ ] 5. Writing the summary (vault layer)
  - _Depends on: 4_
  - [ ] 5.1 In `src/vault/month.ts`, add `writeSummary`, following "`writeSummary`" in the design. It computes the counts and moving tasks from disk, never takes them as input, and writes with `writeNew` or `replaceIfUnchanged`.
  - [ ] 5.2 Tests in `tests/vault/month.test.ts` (core only):
    - Creating the note, and checking that "Tasks done" matches the completed tasks on disk.
    - Appending to a hand-made monthly note with a `## Reading` heading, keeping its lines.
    - The same input again: `unchanged`, and the file is byte for byte the same.
    - A different input: `SUMMARY_EXISTS`, and the file is unchanged.
    - The current month refused with `INVALID_DATE`.
  - _Requirements: 6.1 to 6.8_

- [ ] 6. CLI commands
  - _Depends on: 5_
  - [ ] 6.1 Create `src/cli/month.ts` (the group), `month-show.ts`, and `month-summary.ts`, following "CLI" in the design, and register the group in `src/cli/registers.ts`. The month argument defaults to the past month of `--date` or today's journal date. `month summary` reads stdin like `future-add.ts`: `USAGE` when stdin is a terminal. Both support `--json`. `month summary` supports `--dry-run`.
  - [ ] 6.2 In `src/cli/task-review.ts`, print one line when `pendingMonth` is set, as in the design. The JSON gets the field from task 4.3 without other changes.
  - [ ] 6.3 One end-to-end test in `tests/cli/month.test.ts`, in the style of `tests/cli/task.test.ts`: with notes in October and a clock in November, `task review --json` reports `pendingMonth` for `2026-10`; `month show --json` lists a leftover; `task migrate` on it succeeds; `month summary --json` with stdin writes the note; then `task review --json` reports `pendingMonth: null`. Every `--json` output must parse. In the same file, check that `month show 2026-11` with a November clock exits with code 2.
  - _Requirements: 1, 6, 7, 10.4_

- [ ] 7. Vault format document
  - _Depends on: 6. Can run at the same time as tasks 8 and 9._
  - [ ] 7.1 Update `docs/vault-format.md`, following "Format document" in the design: the location in "Where notes live", a "Monthly note" section with the example, how tasks done and moving tasks are counted, how a summary is recognized, that dibujo never changes a note with a summary, and "Versioning" (still 1, and why).
  - [ ] 7.2 In `tests/docs/vault-format.test.ts`, add one test that takes the monthly note example from the document and checks `hasSummary` is true.
  - _Requirements: 10.1 to 10.3_

- [ ] 8. The `monthly-migration` skill
  - _Depends on: 6. Can run at the same time as tasks 7 and 9._
  - [ ] 8.1 Create `skills/monthly-migration/SKILL.md`, following "`monthly-migration` (new)" in the design. Match the style and structure of `skills/morning-planning/SKILL.md`: a short intro, a Rules section, numbered steps, choice tables, and the error table for saving. Reuse its wording for the choices, flagged tasks, and children instead of inventing new wording.
  - [ ] 8.2 Keep the frontmatter to `name` and `description`. Link to `references/vault-format.md`, and don't restate the note format. Use only commands that exist (`dibujo month show`, `dibujo month summary`, `dibujo task migrate|schedule|set`, `dibujo future due|migrate|reschedule|cancel`), always with `--json`.
  - [ ] 8.3 The existing test that checks every skill's frontmatter must pass for the new skill.
  - _Requirements: 8.1 to 8.14_

- [ ] 9. Update the `morning-planning` skill and the README
  - _Depends on: 6. Can run at the same time as tasks 7 and 8._
  - [ ] 9.1 In `skills/morning-planning/SKILL.md`: keep `data.pendingMonth` in step 2, add step 12 after the report as in the design, mention it in the opening paragraph's list of steps, and add "offers the monthly migration when a new month starts" to the `description`. No other step changes.
  - [ ] 9.2 In `README.md`, add a `monthly-migration` row to the skills table, with what it does and example phrases ("Do my monthly migration", "summarize last month").
  - _Requirements: 9.1 to 9.5, 10.5_

- [ ] 10. Final checks
  - _Depends on: 7, 8, 9_
  - [ ] 10.1 Update `.kiro/steering/structure.md`: list `src/bujo/month.ts`, `src/bujo/monthly-note.ts`, `src/vault/month.ts`, the `month-*` CLI files, the `monthly-migration` skill, and the `Monthly/YYYY-MM.md` note location.
  - [ ] 10.2 Run `npm run format`, `npm run check`, and `npm test`. Then run `npm run build` and `npm pack --dry-run`, and confirm the output includes `dist/cli/month-*.js` and `skills/monthly-migration/SKILL.md`.
  - [ ] 10.3 With a scratch vault (`DIBUJO_VAULT_PATH` pointing at a temporary folder, and `XDG_CONFIG_HOME` at another), run the built CLI: add a few October notes with `log add --date`, then with `--date` in November run `task review`, `month show`, `month summary --dry-run`, and `month summary`. Confirm each exits with code 0 and prints valid JSON with `--json`, and that a second `month summary` with the same input reports `unchanged`.
  - _Requirements: 10.4_

## For the user, after the pull request (not for the agent)

These checks need Obsidian or a real agent session, which a cloud sandbox doesn't have.

- [ ] A. Run `npm run build && dibujo skills install` (or `npm run dev -- skills install --target .kiro/skills` in the repo) so the new and updated skills are installed.
- [ ] B. Open a monthly note in Obsidian and check that it reads well, with the title, the four sections, and the Themes and Intentions parts.
- [ ] C. On the first morning of a month, run "plan my morning". Check that the monthly migration is offered after the report, that saying "later" brings it back the next morning, and that saying yes walks through leftovers, the future log, and the summary with two confirmations.
- [ ] D. Edit the text of a summary by hand, then run `dibujo task review --json` and check `pendingMonth` stays null.
