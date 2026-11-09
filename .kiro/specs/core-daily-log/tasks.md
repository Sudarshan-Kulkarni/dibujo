# Tasks: core daily log

Each task builds on the ones before it and ends with `npm run check` and `npm test` passing. Commit after each top-level task, using the `<verb>: <description>` format.

- [ ] 1. Scaffold the package
  - [ ] 1.1 Create `package.json` as described in the design's Package setup section: name `digi-bujo`, `"type": "module"`, `engines.node >=22`, `bin.dibujo`, `files`, and the scripts (`dev`, `build`, `test`, `check`, `format`, `prepublishOnly`). Install the runtime and dev dependencies.
  - [ ] 1.2 Add `tsconfig.json` (strict, NodeNext, ES2023, `noUncheckedIndexedAccess`) and `tsconfig.build.json` (only `src/` → `dist/`, no tests).
  - [ ] 1.3 Add `biome.json`, a `.gitignore` (`node_modules/`, `dist/`, `.env`, `.kiro/skills/`, `*.tgz`), `.env.example` with a placeholder `DIBUJO_VAULT_PATH`, and a short `README.md` covering install and `dibujo init`.
  - [ ] 1.4 Create `src/cli/index.ts` with the `#!/usr/bin/env node` shebang and a commander program that has `--help` and `--version`. The version is read from `package.json`.
  - [ ] 1.5 Check that `npm run check` passes, that `npm run build` runs, and that `node dist/cli/index.js --version` prints the package version.
  - _Requirements: 2.1, 2.2, 2.4, 2.5_

- [ ] 2. Errors, output, and command context
  - [ ] 2.1 Create `src/errors.ts` with `DibujoError(code, message, hint?)`, the error codes from the design's table, and a function that maps each code to exit code 1 or 2.
  - [ ] 2.2 Create `src/cli/output.ts`. In human mode it writes to stdout and stderr. In `--json` mode it prints exactly one `{ ok, data }` or `{ ok, error }` document to stdout. Stack traces are printed only when `DIBUJO_DEBUG=1`.
  - [ ] 2.3 Define the command context `ctx` (`env`, `now`, `stdin`, `stdout`, `stderr`, `isTTY`, `homedir`). Build the real `ctx` in `index.ts`. Route commander errors through `exitOverride()` so they become `USAGE` (exit 2), and map uncaught exceptions to `INTERNAL` (exit 1).
  - [ ] 2.4 Add tests: an unknown flag exits 2, an internal error exits 1 with a generic message, and `--json` output always parses as JSON.
  - _Requirements: 2.3, 2.4, 2.7_

- [ ] 3. Bullet types, parsing, and formatting
  - [ ] 3.1 Create `src/bujo/types.ts` with `BulletType`, `TaskState`, `Signifier`, and `Bullet` (`type`, `state?`, `signifiers`, `text`, `depth`).
  - [ ] 3.2 Create `src/bujo/bullet.ts` with `parseBulletLine` and `formatBullet`, following the design's parsing rules: any list marker is accepted for tasks, `*` means event, `-`/`+` means note, signifier tags at the end of the line are pulled out, depth comes from 4 spaces or 1 tab per level, and unknown checkbox characters return `null`.
  - [ ] 3.3 Add table tests that cover every task state, events, notes, both signifiers, nested bullets, `* [ ]` written by hand, unknown checkbox characters, tags in the middle of the text, and lines that are not bullets.
  - _Requirements: 1.2, 1.4, 1.5, 1.7, 1.11_

- [ ] 4. Journal date
  - [ ] 4.1 Create `src/bujo/journal-date.ts` with `journalDate(now, dayStartHour)` and `parseDateArg(value)`. `parseDateArg` rejects anything that isn't a real `YYYY-MM-DD` date with `INVALID_DATE`.
  - [ ] 4.2 Add tests around midnight, with `dayStartHour` 0 and 4, on DST change days, for February 30, and for badly formatted input.
  - _Requirements: 3.3, 5.3, 6.1_

- [ ] 5. Capture schema and daily note logic (pure)
  - [ ] 5.1 Create `src/bujo/capture.ts` with the `BulletInput` and `CaptureInput` zod schemas from the design. Include the checks that `state` is only allowed on tasks and that `depth` goes up by at most one level at a time. Add `captureId` (8 hex characters of sha256 over canonical JSON, with line endings normalized) and `formatCallout(time, id, raw)`.
  - [ ] 5.2 Create `src/bujo/note.ts`:
    - `newNoteTemplate(date)` builds a new note with frontmatter `dibujo: 1`, `type: daily`, `date`, and empty `## Log` and `## Captures` sections.
    - `parseDailyNote(content)` returns the version (a missing version counts as 1), the bullets, the unrecognized lines with their line numbers, and the capture ids. Headings are matched case-insensitively.
    - `appendCapture(original, bullets, callout)` adds missing sections, inserts the bullets after the last line of the Log section, appends the callout, and checks that every original line is still present in order.
  - [ ] 5.3 Add tests:
    - Every valid bullet comes back unchanged after `formatBullet` and then `parseBulletLine`.
    - `captureId` gives the same result with `\r\n` and `\n` line endings.
    - `appendCapture` works on a new note, on a note with existing content, on a note with no sections, and on a note with sections the user added.
    - Original lines are always kept.
    - Raw text that contains `## ` stays inside the callout.
  - _Requirements: 1.6, 1.8, 1.9, 1.10, 1.11, 1.12, 5.2, 5.4, 5.5, 5.6_

- [ ] 6. Vault format document
  - [ ] 6.1 Write `docs/vault-format.md`. It covers the note location, the frontmatter fields, the sections, the bullet table with Bullet Journal symbols, the signifier tags, nesting, the capture callouts, how unrecognized lines are handled, and how the version number works.
  - [ ] 6.2 Add two warnings to the document: Markdown formatters that rewrite `*` to `-` will turn events into notes, and edits made in Obsidian while dibujo is writing a note can be lost (the "Editing while dibujo writes" note).
  - [ ] 6.3 Add a test that parses the example note in `docs/vault-format.md` and gets the expected bullets, so the document and the parser can't drift apart.
  - _Requirements: 1.1–1.10_

- [ ] 7. Configuration, `dibujo init`, and `dibujo config`
  - [ ] 7.1 Create `src/config.ts`:
    - Find the config file path from `XDG_CONFIG_HOME`, falling back to `~/.config`.
    - Validate the config with zod.
    - Load it by merging defaults, then the file, then `DIBUJO_VAULT_PATH`, and record where each value came from.
    - `requireVault` throws `CONFIG_MISSING` or `VAULT_NOT_FOUND`.
    - Save atomically, with the directory at mode `0700` and the file at `0600`.
  - [ ] 7.2 Create `src/cli/init.ts`:
    - Read `--vault`, `--folder`, `--day-start`, and `--force`, expanding `~`.
    - Prompt for missing values with `node:readline/promises`, only when there is a terminal.
    - Without a terminal, a missing `--vault` is a `USAGE` error.
    - Check that the vault exists. Warn, but continue, if it has no `.obsidian/` folder.
    - If a config already exists, show it and ask before replacing it. Without a terminal, require `--force` and otherwise fail with `CONFIG_EXISTS`.
  - [ ] 7.3 Create `src/cli/config-show.ts`. It prints the config file path and each value with its source (default, file, or env).
  - [ ] 7.4 Add tests:
    - The file mode is `0600`.
    - A vault path that doesn't exist is rejected and nothing is saved.
    - `folder` values containing `..` or starting with `/` are rejected.
    - The environment variable overrides the file, and its source is reported.
    - Without a terminal, `init` without `--vault` exits 2, and `init` without `--force` over an existing config fails.
  - _Requirements: 3.1–3.10_

- [ ] 8. Vault file access
  - [ ] 8.1 Create `src/vault/paths.ts` with `resolveInVault`, which rejects any path that resolves outside `<vault>/<folder>`, and `dailyNotePath(config, date)`.
  - [ ] 8.2 Create `src/vault/atomic-write.ts`:
    - `writeNew` writes a hidden temp file, fsyncs it, and links it into place. If the file already exists (`EEXIST`), it fails with `NOTE_CHANGED`.
    - `replaceIfUnchanged` writes a temp file, re-reads the note, compares it to the original, and renames the temp file into place.
    - Both delete the temp file on any failure.
    - Accept a test hook that runs between the read and the write.
  - [ ] 8.3 Create `src/vault/daily.ts`:
    - `readDailyNote(config, date)` reads and parses a day's note.
    - `addCapture(config, date, capture, { dryRun, now })` follows the steps in the design's Writing a capture section, including the `unchanged` and `NOTE_VERSION_UNSUPPORTED` paths.
  - [ ] 8.4 Add integration tests in a temp vault:
    - Creating a note and then appending to it matches the expected fixture files.
    - A duplicate capture returns `unchanged`.
    - A change made through the hook gives `NOTE_CHANGED` and leaves the file untouched.
    - A note created in the meantime gives `NOTE_CHANGED`.
    - A dry run writes nothing.
    - A note with user-written frontmatter keeps its frontmatter byte-for-byte.
    - No temp files are left behind.
  - _Requirements: 5.3–5.9, 6.1, 6.4_

- [ ] 9. `dibujo log show` and `dibujo log add`
  - [ ] 9.1 Create `src/cli/log-show.ts`. It takes `--date` and `--json`. In human mode it prints the bullets as Bullet Journal symbols. In JSON mode it prints the `data` shape from the design. A missing note is not an error and returns `exists: false`.
  - [ ] 9.2 Create `src/cli/log-add.ts`:
    - If stdin is a terminal, fail with `USAGE` and a hint to pipe the JSON in.
    - Parse the JSON from stdin. Report bad JSON or schema errors as `INVALID_INPUT`, listing the paths of the failing fields.
    - Take `--date`, `--dry-run`, and `--json`. The `data` shape follows the design, and `--dry-run` also returns `content`.
  - [ ] 9.3 Register both commands under `dibujo log`, and make commands that need a vault fail with the `CONFIG_MISSING` hint when none is set up.
  - [ ] 9.4 Add CLI tests: adding a capture and then showing the day returns the same bullets, duplicate adds, invalid input exits 2, a terminal on stdin exits 2, and missing config gives the hint. With `--json`, stdout always parses.
  - _Requirements: 5.1, 5.2, 5.9, 5.10, 6.1–6.4, 3.9_

- [ ] 10. Skill installation
  - [ ] 10.1 Create `src/skills/harnesses.ts` with the `Harness` interface and `HARNESSES`, containing only `kiro`. Include the planned `agy` entry as a comment.
  - [ ] 10.2 Create `src/skills/install.ts`:
    - Find the package root by walking up to the nearest `package.json` named `digi-bujo`.
    - `planInstall` is a pure function that applies the design's status rules, comparing versions with semver.
    - `applyInstall` stages each skill folder, adds `references/vault-format.md` and `.dibujo.json`, swaps the staged folder into place, and restores the old folder if anything fails.
  - [ ] 10.3 Create `src/cli/skills-install.ts`:
    - Take `--harness` (default `kiro`), `--target`, `--force`, `--dry-run`, and `--json`.
    - Using `--harness` and `--target` together is a `USAGE` error.
    - An unknown harness is `UNKNOWN_HARNESS`, listing the supported names.
    - Print the status of each skill.
  - [ ] 10.4 Add tests against a temp target and a fake package root:
    - Each status in the design's table: installed, unchanged, updated, a newer version skipped, a folder not created by dibujo skipped, and `--force` replacing both kinds of skipped folder.
    - `--dry-run` writes nothing.
    - Installed skills contain `references/vault-format.md` and `.dibujo.json`.
  - _Requirements: 4.1–4.12_

- [ ] 11. `daily-log` skill
  - [ ] 11.1 Write `skills/daily-log/SKILL.md`, with the frontmatter and the six steps from the design: find the CLI, read the day, turn the text into bullets, show the proposal, write it with a quoted heredoc, and report the result. It links to `references/vault-format.md` and uses only the standard Agent Skills frontmatter.
  - [ ] 11.2 Install the skill with `npm run dev -- skills install --target .kiro/skills`. Then run a manual capture against a scratch vault: a brain-dump with a task, an event, a note, a priority item, and a mention of "yesterday". Check the proposal, the confirmation step, the date check, the note written to disk, and a second identical capture returning `unchanged`.
  - _Requirements: 7.1–7.8, 4.12_

- [ ] 12. Update the steering files
  - [ ] 12.1 Update `.kiro/steering/structure.md`:
    - Add `src/skills/` and `src/errors.ts` to the layout.
    - Replace the symlink-based development flow with `npm run dev -- skills install --target .kiro/skills`.
    - Describe how installed skills get `references/vault-format.md`.
  - [ ] 12.2 Update `.kiro/steering/tech.md` to replace `npm run dibujo` with `npm run dev` and add `semver` to the library table.
  - _Requirements: none (keeps steering in line with the design)_

- [ ] 13. Check the package end to end
  - [ ] 13.1 Add a test that runs `npm pack --dry-run --json` and checks that only `dist/`, `skills/`, `docs/`, `package.json`, `README.md`, and `LICENSE` are included.
  - [ ] 13.2 Run `npm run build` and `npm link`. Then run `dibujo --version`, `dibujo init --vault <scratch vault>` (with `XDG_CONFIG_HOME` pointing to a scratch folder), `dibujo skills install --dry-run`, and a piped `dibujo log add`. Confirm the exit codes and that the note written to disk is correct.
  - [ ] 13.3 Run `npm pack` and install the resulting `.tgz` in a scratch folder. Run `npx dibujo --help` there to confirm the published package works without dev tools.
  - _Requirements: 2.1, 2.3, 2.6_
