# Requirements: morning planning

## Introduction

This spec adds the first Bullet Journal ritual: morning planning. The user starts it by asking their agent. The agent leads a short, interactive conversation, one step at a time:

1. **Migration.** Go through each open task from yesterday's note. The user says what they did with it in their paper notebook, and dibujo mirrors that choice in the vault.
2. **Brain-dump.** The user writes whatever is on their mind this morning, and the agent turns it into tasks, events, and notes, the same way the daily log does.
3. **Priority** (optional). The user can mark what matters most today.
4. **Confirm and save.** The agent shows every change and saves only after the user approves.

The paper notebook stays the primary journal. dibujo mirrors what the user did on paper and does not decide anything for them.

Out of scope, and planned for later specs: evening reflection, monthly migration, the future log (including surfacing scheduled tasks when their date arrives), and reminders or scheduled runs (cron or notifications). This spec must leave room for them. In particular, the user will later start this ritual from a reminder instead of by asking.

This spec builds on `core-daily-log`. Vault format, CLI behavior, atomic writes, `NOTE_CHANGED` handling, `--json`, and `--dry-run` follow that spec and `.kiro/steering/tech.md`, and are not repeated here.

## Glossary

Terms from `core-daily-log` (vault, daily note, bullet, task state, capture, skill, journal date) keep their meaning.

- **Today**: the current journal date.
- **Yesterday**: the calendar day before today. It does not skip days with no note.
- **Open task**: a task in state `open` (`- [ ]`).
- **Migration choice**: what the user did with an open task on paper. One of migrate, schedule, cancel, complete, or leave open.
- **Migration streak**: the number of consecutive days, ending yesterday, on which the same task was migrated forward.

## Requirements

### Requirement 1: Changing a task's state

**User story:** As the agent running a ritual, I want to change the state of a task that is already in a note, so that the vault matches the user's paper notebook.

#### Acceptance criteria

1. THE CLI SHALL provide a command that changes the state of one task in an existing daily note to completed, migrated, scheduled, cancelled, or open.
2. THE command SHALL change only the checkbox character of that task's line, and SHALL NOT change its text, signifiers, indentation, or any other line in the note.
3. THE command SHALL identify the task in a way that cannot silently hit the wrong line. IF the task given does not match the note on disk, THEN THE CLI SHALL change nothing and exit with an error.
4. IF the line is not a task, THEN THE CLI SHALL change nothing and exit with an error.
5. WHEN the task is already in the requested state, THE CLI SHALL change nothing and report that it was unchanged.
6. THE command SHALL support `--dry-run` and `--json`, and SHALL write atomically with the same `NOTE_CHANGED` check as `dibujo log add`.

### Requirement 2: Migrating a task to today

**User story:** As the user, when I migrate a task on paper, I want dibujo to do the same, so that yesterday shows `>` and the task appears as open in today's note.

#### Acceptance criteria

1. THE CLI SHALL provide a way to migrate an open task from one daily note to another: mark it migrated (`[>]`) in the source note and add it as an open task to the target note.
2. THE migrated task SHALL keep its original text and signifiers.
3. WHEN the task has nested child bullets, THE CLI SHALL migrate them together with it, keeping their order and nesting. Open child tasks SHALL be marked migrated in the source note and added as open tasks in the target note. Child events and notes SHALL be copied unchanged. Completed, scheduled, and cancelled child tasks SHALL stay in the source note only.
4. WHEN the target note does not exist, THE CLI SHALL create it using the documented format.
5. WHEN the target note already contains a task linked to the source task (criterion 7), THE CLI SHALL NOT add a second copy, and SHALL still mark the source task migrated.
6. IF migration is interrupted after one note is written but before the other, THEN running the same migration again SHALL finish it without duplicating the task.
7. THE migration SHALL link each migrated copy back to the exact task it came from, including migrated child tasks. The link SHALL:
   - be an Obsidian link that opens the source note at that task when clicked, with no plugins needed;
   - make the source note show the new note in Obsidian's backlinks pane;
   - resolve to the right note even if other notes in the vault have the same file name;
   - not count as part of the task's text, so it never shows up in `text` fields in `--json` output;
   - stay readable in the raw Markdown and survive the user rewording the task.
8. THE migration SHALL add to the source task's line only what the link in criterion 7 needs to point at, and SHALL NOT change the source task's text or signifiers.
9. THE command SHALL support `--dry-run` and `--json`.

### Requirement 3: Scheduling a task

**User story:** As the user, when I schedule a task for a later date on paper, I want dibujo to mark it scheduled and remember the date, so that the future log can pick it up later.

#### Acceptance criteria

1. WHEN the user schedules a task, THE CLI SHALL mark it scheduled (`[<]`) in its note.
2. THE CLI SHALL accept a target date and store it on the task's line in the Tasks plugin's scheduled-date form (`⏳ YYYY-MM-DD`), so that a later future-log spec can find scheduled tasks by date and the Tasks plugin can show them.
3. Storing the date SHALL NOT change the task's text or signifiers. IF the task already has a scheduled date, THEN THE CLI SHALL replace that date only.
4. THE CLI SHALL NOT add the task to any other note in this spec.

### Requirement 4: Reviewing yesterday's open tasks

**User story:** As the agent running morning planning, I want a list of yesterday's open tasks with their migration history, so that I can walk the user through them and flag tasks that keep getting pushed.

#### Acceptance criteria

1. THE CLI SHALL provide a command that lists the open tasks in yesterday's note, using `--date` to choose another day as "today" when needed.
2. WHEN run with `--json`, THE command SHALL print, for each open task, its text, signifiers, depth, what the state-change and migration commands need to identify it, and its migration streak.
3. THE CLI SHALL compute the migration streak by following migration links (Requirement 2.7) backward from each of yesterday's open tasks. Each link that points to a migrated task (`[>]`) in the previous calendar day's note adds 1 to the streak.
4. THE streak SHALL end at the first task that has no link, whose link points to a day other than the previous calendar day, or whose link cannot be resolved (for example, because the user deleted the source line). A broken link SHALL never cause an error.
5. WHEN a task's migration streak reaches the configured flag threshold (Requirement 7), THE command SHALL mark it as flagged.
6. IF yesterday has no note or no open tasks, THEN THE command SHALL return an empty list and exit with code 0.
7. Open tasks from days before yesterday SHALL NOT be listed. They are left for the monthly migration spec.
8. Open child tasks SHALL be listed under their parent task, because they are migrated with it (Requirement 2.3).

### Requirement 5: Morning planning skill

**User story:** As the user, I want to say "start my morning planning" and be guided through migration and a brain-dump, so that my vault mirrors my notebook without much effort.

#### Acceptance criteria

1. THE package SHALL include a `morning-planning` skill whose `description` tells an agent to use it when the user wants to plan their morning, start their day, or migrate yesterday's tasks.
2. THE skill SHALL run these steps in this order: migration, brain-dump, priority, confirm and save.
3. **Migration:** THE skill SHALL instruct the agent to go through yesterday's open tasks one at a time and ask for the user's migration choice. WHEN the choice is schedule, the agent SHALL ask for the date.
4. WHEN a task is flagged (Requirement 4.5), THE skill SHALL instruct the agent to tell the user how many days in a row it has been migrated and ask whether to keep it or drop it, without pushing either answer.
5. **Brain-dump:** THE skill SHALL instruct the agent to ask what is on the user's mind and turn the answer into bullets using the same rules as the `daily-log` skill (short, the user's own words, no added content, signifiers only when the text supports them, raw text kept).
6. THE skill SHALL NOT ask fixed prompts about mood, sleep, gratitude, or events. Anything like that comes only from what the user writes in the brain-dump.
7. **Priority:** THE skill SHALL instruct the agent to ask once whether anything matters most today, and to add the priority signifier only to bullets the user names.
8. **Skipping:** THE skill SHALL skip any step that has nothing to review, and SHALL let the user skip any step or prompt by saying so ("skip", "nothing", "no"). WHEN every step is skipped, THE agent SHALL save nothing and say so.
9. **Confirm and save:** THE skill SHALL instruct the agent to show every change together before writing: the state changes to yesterday's tasks and the new bullets for today, using Bullet Journal symbols. THE agent SHALL save only after the user confirms, and SHALL apply edits and show the result again if anything changed.
10. THE skill SHALL instruct the agent to make every vault change through `dibujo` commands with `--json`, and never to edit vault files directly.
11. IF any command fails, THEN THE skill SHALL instruct the agent to report exactly which changes were saved and which were not, and SHALL NOT claim a change was saved unless the CLI returned `"ok": true`.
12. THE skill SHALL work when started by the user in a conversation, and SHALL NOT depend on how it was started, so that a later reminder spec can start it too.

### Requirement 6: Vault format updates

**User story:** As the user, I want any new markup in my notes documented, so that I can still read and edit them by hand.

#### Acceptance criteria

1. `docs/vault-format.md` SHALL document the migration link (Requirement 2.7), the markup it adds to the source task (Requirement 2.8), and the scheduled date (Requirement 3.2), including the order of links, scheduled dates, and signifier tags at the end of a line.
2. Notes written by the `core-daily-log` version of dibujo SHALL still be read correctly. A task without a migration link or scheduled date SHALL still be a valid task.
3. WHEN the user adds or edits a migration link or scheduled date by hand in the documented form, THE CLI SHALL read it correctly.
4. IF the new markup cannot be added within format version 1, THEN the design SHALL explain why, and the format version SHALL be raised as described in `docs/vault-format.md`.

### Requirement 7: Flag threshold setting

**User story:** As the user, I want to choose how many days in a row a task can be migrated before it's flagged, so that the nudge fits how I work.

#### Acceptance criteria

1. THE config SHALL have a migration flag threshold: a whole number of days, 2 or more, defaulting to 3.
2. `dibujo init` SHALL accept the threshold as a flag. It SHALL NOT add a new interactive prompt, so the existing setup flow stays short.
3. THE command that prints the active config SHALL show the threshold and where it came from.
4. IF the config holds an invalid threshold, THEN THE CLI SHALL exit with an error that names the setting and the valid range.
5. Config files written by the `core-daily-log` version of dibujo SHALL still load, using the default threshold.

## Decisions

1. **Yesterday** is the previous calendar day, not the most recent note (Requirement 4.1).
2. **Older open tasks** are not reviewed here. Tasks are migrated day by day, and a task migrated repeatedly is flagged (Requirement 4.5).
3. **Migration links:** each migrated copy links back to the exact task it came from, and streaks are computed by following those links. This adds a little markup to each line, but streaks survive rewording and are cheap to compute (Requirements 2.7 and 4.3). The exact link syntax is chosen in the design.
4. **Scheduled dates** use the Tasks plugin form `⏳ YYYY-MM-DD`. Surfacing them on their date belongs to the future log spec (Requirement 3).
5. **Nested tasks** move with their parent (Requirement 2.3).
6. **Flag threshold** is a config setting, defaulting to 3 days (Requirement 7).
7. **No fixed check-in prompts.** Mood, sleep, and similar content come from the brain-dump only (Requirement 5.6).
8. **Started by the user** for now. Reminders and cron come in a later spec (Requirement 5.12).
9. **The skill coordinates the ritual.** The agent follows the skill's steps and talks to the user. The CLI only reads notes and writes the changes, with no conversation logic.
