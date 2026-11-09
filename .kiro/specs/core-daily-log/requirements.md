# Requirements: core daily log

## Introduction

This spec sets up the dibujo repo and delivers its first end-to-end workflow:

1. **Vault format.** A documented Markdown format for daily notes and Bullet Journal bullets, stored in an Obsidian vault.
2. **CLI package.** The `digi-bujo` npm package, which provides the `dibujo` executable.
3. **First-time setup and config.** Pointing dibujo at the user's vault.
4. **Skill installation.** A command that installs dibujo's agent skills into an agent's skills directory.
5. **Daily-log capture.** An agent skill and CLI commands that turn the user's stream-of-consciousness text into Bullet Journal bullets in the right daily note.

Out of scope, and planned for later specs: reflection and monthly migration rituals, reminders and notifications, and monthly or yearly reviews. The vault format defined here must still leave room for them. For example, it must be able to represent migrated and scheduled tasks, even though this spec does not migrate anything.

General CLI behavior for agents and scripts, such as never prompting without a terminal and printing only JSON to stdout with `--json`, follows the rules in `.kiro/steering/tech.md` and is not repeated here.

## Glossary

- **Vault**: the Obsidian vault folder that the user configures.
- **Daily note**: one Markdown file per calendar day that holds that day's bullets.
- **Bullet**: one Bullet Journal entry, which is a task, an event, or a note.
- **Signifier**: a marker that adds meaning to a bullet, such as priority or inspiration.
- **Task state**: open, completed, migrated, scheduled, or cancelled.
- **Capture**: one submission of raw text from the user, together with the bullets parsed from it.
- **Skill**: an Agent Skills folder (`SKILL.md` plus optional references) shipped in the package.
- **Harness**: an agent tool that loads skills, such as Kiro or Antigravity (`agy`).
- **Journal date**: the date that an entry belongs to. It is the local calendar date, except that times before the configured day-start hour count as the previous date.

## Requirements

### Requirement 1: Vault format specification

**User story:** As the user, I want one documented note format, so that the skills, the CLI, and I (editing by hand in Obsidian) all read and write notes the same way.

#### Acceptance criteria

1. The project SHALL include `docs/vault-format.md`, which defines the daily note file path and name, the frontmatter fields, the section layout, the bullet syntax for each bullet type and task state, and the signifier syntax.
2. The format SHALL represent these bullet types: task, event, and note.
3. Daily notes SHALL be stored at `<vault>/<dibujo folder>/Daily/YYYY-MM-DD.md`. The dibujo folder is configurable and defaults to `Bujo`.
4. Tasks SHALL use Obsidian task checkboxes, with one checkbox character per task state: `- [ ]` open, `- [x]` completed, `- [>]` migrated, `- [<]` scheduled, `- [-]` cancelled.
5. Events and notes SHALL be plain list items without checkboxes, and SHALL use two different list markers, so that the bullet type can be read from the raw Markdown.
6. The format document SHALL include a table that maps each bullet type and task state to its Bullet Journal symbol (•, ×, >, <, ○, –).
7. The format SHALL represent at least these signifiers: priority and inspiration.
8. The format SHALL render as readable Markdown in Obsidian without any plugins.
9. The format SHALL store each capture's original raw text in the same daily note as the bullets parsed from it.
10. The format SHALL include a version number in each note's frontmatter, so that later versions of dibujo can detect and migrate older notes.
11. WHEN the user edits a daily note by hand in a way that follows the documented format, THE CLI SHALL read the edited note correctly.
12. WHEN the CLI reads a line in the bullets section that does not match the bullet syntax, THE CLI SHALL keep the line unchanged and report it as unrecognized, and SHALL NOT fail or delete it.

### Requirement 2: Package and executable

**User story:** As the user, I want to install dibujo from npm and run it as `dibujo`, so that I can use it from any terminal and any agent.

#### Acceptance criteria

1. The project SHALL be published as the npm package `digi-bujo`, which provides an executable named `dibujo`.
2. THE package SHALL run on Node.js 22 or later and SHALL declare that range in `engines`.
3. WHEN the user runs `npx -y digi-bujo <command>` or, after a global install, `dibujo <command>`, THE CLI SHALL run the given command.
4. WHEN the user runs `dibujo --help` or `dibujo <command> --help`, THE CLI SHALL print usage for the available commands or for that command.
5. WHEN the user runs `dibujo --version`, THE CLI SHALL print the package version.
6. THE published package SHALL contain only the compiled CLI, the skills, and the docs, and SHALL NOT depend on development tools at runtime.
7. THE CLI SHALL exit with code 0 on success, 1 on runtime errors, and 2 on invalid usage.

### Requirement 3: First-time setup and configuration

**User story:** As the user, I want a one-time setup that points dibujo at my vault, so that I don't have to pass the vault path to every command.

#### Acceptance criteria

1. WHEN the user runs `dibujo init` in an interactive terminal, THE CLI SHALL ask for the vault path, the folder inside the vault where dibujo stores its notes, and the day-start hour, then save them to the config file.
2. THE CLI SHALL accept the same settings as flags on `dibujo init`, so that setup can run without prompts.
3. THE day-start hour SHALL be a whole hour from 0 to 23 and SHALL default to 0 (midnight).
4. THE CLI SHALL store config at `$XDG_CONFIG_HOME/dibujo/config.json`, or at `~/.config/dibujo/config.json` when `XDG_CONFIG_HOME` is not set.
5. THE CLI SHALL create the config file with permissions that allow only the owner to read and write it (`0600`).
6. IF the vault path given to `dibujo init` does not exist or is not a directory, THEN THE CLI SHALL report the error and SHALL NOT save the config.
7. IF a config file already exists, THEN `dibujo init` SHALL show the current values and ask before overwriting them, or SHALL require `--force` when not interactive.
8. WHEN the environment variable `DIBUJO_VAULT_PATH` is set, THE CLI SHALL use it instead of the vault path in the config file.
9. IF a command needs the vault and no valid vault path is configured, THEN THE CLI SHALL exit with an error that tells the user to run `dibujo init`.
10. THE CLI SHALL provide a command that prints the active config and where each value came from (default, file, or environment variable).

### Requirement 4: Skill installation

**User story:** As the user, I want to install dibujo's skills into my agent with one command, so that the agent knows how to run my Bullet Journal rituals.

#### Acceptance criteria

1. WHEN the user runs `dibujo skills install`, THE CLI SHALL copy every skill shipped in the package, and the vault format reference, into the skills directory of the chosen harness.
2. THE CLI SHALL keep a table of supported harnesses, each with a name and a global skills directory. This spec SHALL support the harness `kiro`, with the directory `~/.kiro/skills/`.
3. THE CLI SHALL accept `--harness <name>` to choose a supported harness, and SHALL use `kiro` when no harness is given.
4. THE CLI SHALL accept `--target <dir>` to install into any directory instead of a harness's directory. `--target` and `--harness` SHALL NOT be used together.
5. IF `--harness` names an unsupported harness, THEN THE CLI SHALL exit with code 2 and list the supported harnesses.
6. THE CLI SHALL make adding a new harness a change to the harness table only, with no changes to the install logic.
7. THE CLI SHALL record the package version with each installed skill.
8. WHEN an installed skill comes from an older package version, THE CLI SHALL replace it with the current version and report that it was updated.
9. IF a folder at the destination was not installed by dibujo, THEN THE CLI SHALL leave it untouched and report a conflict, unless the user passes `--force`.
10. THE CLI SHALL support `--dry-run`, which lists the changes it would make without writing anything.
11. WHEN installation finishes, THE CLI SHALL list each skill as installed, updated, unchanged, or skipped.
12. THE skills SHALL use only the Agent Skills standard (`SKILL.md` with `name` and `description` frontmatter) and SHALL NOT rely on features of a specific harness, so that the same files work in any harness that supports the standard.

### Requirement 5: Writing captures to the daily note

**User story:** As the user, I want my parsed bullets and my raw text saved to the right daily note, so that my digital log matches the day I wrote about.

#### Acceptance criteria

1. THE CLI SHALL provide a command that adds one capture (raw text plus a list of bullets) to the daily note for a given date.
2. THE command SHALL read the capture as JSON from stdin, and SHALL reject input that does not match the documented schema with exit code 2 and a description of what is wrong.
3. WHEN no date is given, THE CLI SHALL use the current journal date.
4. WHEN the daily note for the date does not exist, THE CLI SHALL create it using the documented format.
5. WHEN the daily note exists, THE CLI SHALL append the new bullets and raw text, and SHALL NOT change or remove existing content.
6. WHEN the same capture is submitted twice for the same date, THE CLI SHALL NOT add it a second time, and SHALL report that it was already present.
7. THE CLI SHALL write notes atomically, so that a crash or interruption never leaves a partly written note.
8. IF the daily note changes on disk between the CLI reading it and writing it, THEN THE CLI SHALL NOT overwrite it, and SHALL exit with an error so the caller can retry.
9. THE command SHALL support `--dry-run`, which prints the resulting note content without writing it.
10. WHEN run with `--json`, THE command SHALL print the note path, the number of bullets added, and whether the note was created, updated, or unchanged.

### Requirement 6: Reading the daily note

**User story:** As the agent running a skill, I want to read a day's bullets as structured data, so that I can show the user what's already logged and avoid duplicating entries.

#### Acceptance criteria

1. THE CLI SHALL provide a command that reads the daily note for a given date, using the current journal date when none is given.
2. WHEN run with `--json`, THE command SHALL print the note's date, path, bullets (with type, state, signifiers, and text), and any unrecognized lines.
3. WHEN run without `--json`, THE command SHALL print the bullets in a readable form in the terminal.
4. IF no daily note exists for the date, THEN THE command SHALL report that the note does not exist and exit with code 0, printing an empty result when `--json` is passed.

### Requirement 7: Daily-log capture skill

**User story:** As the user, I want to tell my agent what's on my mind in my own words and have it logged as concise bullets, so that I can capture quickly without formatting anything myself.

#### Acceptance criteria

1. THE package SHALL include a `daily-log` skill whose `description` tells an agent to use it when the user wants to log thoughts, tasks, or events for a day.
2. THE skill SHALL instruct the agent to turn the user's raw text into bullets that follow `docs/vault-format.md`: short, using the user's own wording, with no added content or commentary.
3. THE skill SHALL instruct the agent to classify each bullet as a task, event, or note, and to add signifiers only when the user's text supports them.
4. THE skill SHALL instruct the agent to show the proposed bullets to the user and get confirmation or edits before writing them.
5. THE skill SHALL instruct the agent to write the confirmed capture only through the CLI command from Requirement 5, and never to edit vault files directly.
6. THE skill SHALL instruct the agent to read the day's existing note first (Requirement 6), so that it does not propose bullets that are already logged.
7. WHEN the user's text clearly refers to a different day, THE skill SHALL instruct the agent to confirm the date with the user before writing.
8. IF a CLI command fails, THEN THE skill SHALL instruct the agent to show the error to the user and SHALL NOT tell the user that the capture was saved.

## Decisions

1. **Note location:** a configurable subfolder, defaulting to `Bujo/`, with daily notes at `Bujo/Daily/YYYY-MM-DD.md` (Requirement 1.3).
2. **Bullet syntax:** checkboxes for tasks, and two different plain list markers for events and notes (Requirements 1.4 and 1.5). The exact markers are chosen in the design.
3. **Late-night entries:** a configurable day-start hour, defaulting to midnight (Requirement 3.3).
4. **Skills target:** a harness table. Only `kiro` (`~/.kiro/skills/`) is supported in this spec, and other harnesses such as Antigravity (`agy`) can be added later as table entries (Requirement 4).
