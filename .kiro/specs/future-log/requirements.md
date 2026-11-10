# Requirements: future log

## Introduction

In a paper Bullet Journal, a task you can't do now gets a `<` and is written into the future log, a separate spread that you check as dates come up. dibujo only has half of that. `dibujo task schedule` marks a task `[<]` and writes a `⏳` date on it, but nothing ever brings the task back.

This spec adds the other half:

1. **Future log note.** One Markdown note per year that holds the tasks scheduled for later dates, grouped by month.
2. **Scheduling.** `task schedule` also writes the task into the future log.
3. **Reading.** Commands to read the future log, and to list the entries that are due.
4. **Handling a due entry.** Bring it into today's daily log, push it to another date, or cancel it.
5. **Morning planning.** The `morning-planning` skill gets a step for due entries, so scheduled tasks come back as part of the morning ritual.

An entry that is due keeps showing up every morning until the user handles it. Nothing is dropped because a day was missed.

Out of scope, and planned for later specs:

- **Adding entries straight to the future log.** On paper you can write "Dec 12, dentist" directly into the future log. In this spec, entries come only from scheduling a daily task. A later spec can add a skill and a command to add dated events and tasks directly. Events will need their own date field, because `⏳` is a Tasks plugin field and only applies to tasks.
- **Monthly migration.** Entries that only have a month, with no day, stay in the future log. They never show up in morning planning. The monthly migration spec handles them at the start of each month.
- Evening reflection, reminders and notifications, and monthly or yearly reviews.

This spec builds on `core-daily-log` and `morning-planning`. Vault format, CLI behavior, atomic writes, `NOTE_CHANGED` handling, `--json`, `--dry-run`, and refs follow those specs and `.kiro/steering/tech.md`, and are not repeated here.

## Glossary

Terms from `core-daily-log` and `morning-planning` (vault, daily note, bullet, task state, origin link, ref, journal date) keep their meaning.

- **Future log**: the set of future log notes. Each note covers one year.
- **Entry**: one bullet in a future log note.
- **Waiting entry**: a task entry in state open (`- [ ]`). It is waiting for its date.
- **Dated entry**: an entry with a `⏳ YYYY-MM-DD` date.
- **Due entry**: a waiting, dated task entry whose date is today or earlier.
- **Today**: the current journal date.
- **Handled**: an entry is handled when it is no longer waiting. It was brought into a daily log, rescheduled, or cancelled.

## Requirements

### Requirement 1: Future log note format

**User story:** As the user, I want the future log to be its own note, like the future log spread in my notebook, so that I can read it and edit it by hand in Obsidian.

#### Acceptance criteria

1. THE project SHALL store the future log as one note per year, at `<vault>/<dibujo folder>/Future/YYYY.md`.
2. WHEN dibujo creates a future log note, THE CLI SHALL write the frontmatter fields `dibujo` (the format version), `type: future`, and `year`. dibujo SHALL NOT edit the frontmatter of an existing note.
3. THE note SHALL group entries under one heading per month, in calendar order, so that it reads like a paper future log.
4. Entries SHALL use the same bullet syntax, task states, and signifiers as daily notes, plus the `⏳` field. A waiting task is `- [ ]`.
5. THE CLI SHALL give task states these meanings in the future log:
   - open (`[ ]`): waiting;
   - migrated (`[>]`): brought into a daily log;
   - scheduled (`[<]`): rescheduled to another date;
   - cancelled (`[-]`): cancelled;
   - completed (`[x]`): completed by hand. dibujo never sets this state.
6. A dated entry's `⏳` date SHALL fall in the month of the section it is written in. WHEN the user edits an entry by hand and the date doesn't match its section, THE CLI SHALL keep the line unchanged and use the `⏳` date.
7. An entry without a `⏳` date, for example one typed by hand, SHALL be valid. THE CLI SHALL keep it unchanged and SHALL NOT list it as due.
8. THE note SHALL link each entry that dibujo adds back to where it came from, and SHALL be linked to from the daily task that comes from it. These links SHALL:
   - be Obsidian links that open the source note at that line when clicked, with no plugins needed;
   - make the source note show the other note in Obsidian's backlinks pane;
   - resolve to the right note even if another note in the vault has the same file name;
   - not count as part of the entry's text.
9. WHEN the CLI reads a line in a future log note that is not a valid bullet, THE CLI SHALL keep the line unchanged and report it as unrecognized, and SHALL NOT fail or delete it.
10. IF a future log note has a format version newer than the CLI supports, THEN THE CLI SHALL NOT write to it, and SHALL exit with `NOTE_VERSION_UNSUPPORTED`.
11. THE CLI SHALL NOT delete or rewrite anything the user wrote in a future log note. It SHALL only append entries, change the checkbox character of an entry, and add or change the `⏳` date and block id of a line.

### Requirement 2: Scheduling a task adds it to the future log

**User story:** As the user, when I schedule a task for a later date on paper, I want dibujo to write it into the future log too, so that it comes back when its date arrives.

#### Acceptance criteria

1. WHEN the user schedules a task with `dibujo task schedule`, THE CLI SHALL mark it `[<]` with its `⏳` date in the daily note, as it does today, and SHALL add a waiting entry to the future log note for the year of that date, under the month of that date.
2. THE entry SHALL keep the task's text and signifiers, SHALL carry the `⏳` date, and SHALL link back to the task in the daily note. THE task in the daily note SHALL get a block id so that the link has a target. THE CLI SHALL NOT make any other change to the task's line.
3. THE CLI SHALL NOT copy nested bullets into the future log. Open tasks nested under a scheduled task stay in the daily note, and show up in the next review as their own items.
4. WHEN the future log note or the month section for the date does not exist, THE CLI SHALL create it. A date in a later year SHALL go in that year's note.
5. THE CLI SHALL write the daily note first and the future log second. IF scheduling is interrupted between the two writes, THEN running the same command again SHALL finish it without adding a second entry.
6. WHEN the task is already `[<]` with the same date but has no future log entry, because it was scheduled before this spec, THEN running `task schedule` again SHALL add the entry and report the daily note as unchanged.
7. WHEN the task is scheduled again for a different date and already has a waiting entry, THE CLI SHALL replace the date in the daily note as it does today, and SHALL reschedule the entry as described in Requirement 4.2.
8. THE CLI SHALL read the future log note and check its format version before it writes anything. IF the future log note can't be written, THEN `task schedule` SHALL change nothing.
9. THE command SHALL support `--dry-run`, which prints both resulting notes without writing anything, and `--json`, whose output includes the path and status of both notes.
10. THE CLI SHALL write both notes atomically, with the same `NOTE_CHANGED` check as `dibujo log add`.

### Requirement 3: Reading the future log

**User story:** As the agent running morning planning, I want to read the future log and list the entries that are due, so that I can walk the user through them.

#### Acceptance criteria

1. THE CLI SHALL provide a command that reads a year's future log note, using the current journal year when no year is given. WITH `--json` it SHALL print the months and entries (type, state, signifiers, text, depth, date, origin, and ref), and any unrecognized lines.
2. IF the note for that year does not exist, THEN THE command SHALL report that it does not exist and exit with code 0, printing an empty result when `--json` is passed.
3. THE CLI SHALL provide a command that lists the due entries, using `--date` to choose another day as "today" when needed.
4. THE command SHALL look in the future log note for today's year and in the note of every earlier year, so that an entry left waiting over New Year is not lost.
5. AN entry SHALL stay in the list every day until it is handled. A due entry that was not handled yesterday is listed again today.
6. THE command SHALL NOT list entries dated after today, entries without a date, entries that are not waiting, or events and notes.
7. THE command SHALL list entries by date, then by their position in the note. FOR each entry it SHALL print the ref, text, signifiers, date, the number of days overdue (0 on the day itself), and the date of the daily note it was scheduled from when that is known.
8. WHEN no entries are due, or no future log notes exist, THE command SHALL return an empty list and exit with code 0.
9. IF any future log note it needs has an unsupported format version, THEN THE command SHALL exit with `NOTE_VERSION_UNSUPPORTED`, naming the note, instead of leaving out its entries.

### Requirement 4: Handling a due entry

**User story:** As the user, when a scheduled task comes back, I want to bring it into today, push it to another date, or cancel it, the way I would on paper.

#### Acceptance criteria

1. **Bring in.** THE CLI SHALL provide a command that migrates a waiting entry into a daily note, which is today's by default: it marks the entry `[>]` and adds an open task to the daily note, with the same text and signifiers and a link back to the entry. WITH `--priority`, the new task SHALL also get the priority signifier.
2. **Reschedule.** THE CLI SHALL provide a command that moves a waiting entry to a later date. It marks the entry `[<]` and adds a waiting entry with the new `⏳` date to the right month and year, with the same text and signifiers and a link back to the old entry. THE new date SHALL be later than today.
3. **Cancel.** THE CLI SHALL provide a way to mark a waiting entry cancelled (`[-]`).
4. THE CLI SHALL change an existing entry only by its checkbox character and its block id. THE CLI SHALL check every edit as it does for daily notes, and SHALL refuse and write nothing if an edit would change anything else on a line or any other line.
5. IF bringing in or rescheduling is interrupted after the first note is written but before the second, THEN running the same command again SHALL finish it without adding a second copy.
6. WHEN the target daily note does not exist, THE CLI SHALL create it using the documented format.
7. THE CLI SHALL check the format version of every note it will write before it writes any of them.
8. A task brought into a daily log SHALL be a normal open task from then on, so it can be migrated, scheduled, completed, or cancelled like any other. ITS migration streak SHALL start at 0, because its link points to the future log and not to the day before.
9. EACH entry SHALL have a ref that works with these commands and keeps working when lines are added or removed above it. IF no single entry matches a ref, THEN THE CLI SHALL change nothing and exit with `TASK_NOT_FOUND`. IF the ref points to something that is not a task, THEN THE CLI SHALL exit with `NOT_A_TASK`. IF the entry is not waiting, THEN bringing in or rescheduling SHALL exit with `TASK_NOT_OPEN`.
10. THE commands SHALL support `--dry-run` and `--json`, and SHALL write atomically with the same `NOTE_CHANGED` check as `dibujo log add`.

### Requirement 5: Morning planning skill update

**User story:** As the user, I want scheduled tasks to come back during my morning planning, so that I decide what to do with them once, at the start of the day.

#### Acceptance criteria

1. THE `morning-planning` skill SHALL run these steps in this order: migration of yesterday's tasks, due future log entries, brain-dump, priority, confirm and save.
2. **Due entries:** THE skill SHALL instruct the agent to list the due entries and go through them one at a time, asking whether to bring each one into today, push it to another date, cancel it, or leave it for now. WHEN the choice is to push it, the agent SHALL ask for the date.
3. THE skill SHALL instruct the agent to say how many days overdue an entry is, when it is overdue, in a neutral way, without recommending an answer.
4. WHEN the choice is to leave an entry for now, THE skill SHALL leave it unchanged, and it SHALL come up again the next morning.
5. THE skill SHALL skip the step when nothing is due, and SHALL let the user skip it, or any prompt in it, by saying so ("skip", "nothing", "no").
6. **Priority:** THE skill SHALL let the user name entries they are bringing in as most important today, and SHALL mark them with `--priority`.
7. **Confirm and save:** THE confirmation SHALL show the changes to the future log together with the other changes, using Bullet Journal symbols. THE agent SHALL save only after the user confirms. THE agent SHALL save changes to yesterday's tasks first, then the changes to future log entries, then the brain-dump.
8. THE skill SHALL instruct the agent to make every change through `dibujo` commands with `--json`, and never to edit vault files directly.
9. IF a command fails, THEN THE skill SHALL instruct the agent to retry `NOTE_CHANGED` and `TASK_NOT_FOUND` once as it does for yesterday's tasks, report exactly which changes were saved and which were not, and NOT claim a change was saved unless the CLI returned `"ok": true`.
10. THE skill SHALL keep working when it is started by the user in a conversation, and SHALL NOT depend on how it was started.

### Requirement 6: Compatibility and the vault format document

**User story:** As the user, I want my existing notes to keep working, and the new format written down, so that I can still read and edit everything by hand.

#### Acceptance criteria

1. `docs/vault-format.md` SHALL document the future log note: its location, frontmatter, month headings, entries, task states, how links to and from daily notes are written, and how a due entry is decided.
2. Daily notes written by the `morning-planning` version of dibujo SHALL still be read correctly. A task that is `[<]` with a `⏳` date and has no future log entry SHALL still be a valid task.
3. THE format version SHALL stay at 1. IF the design finds that it can't, THEN it SHALL explain why, and the version SHALL be raised as described in `docs/vault-format.md`.
4. THE changes to existing `--json` output, such as the future log information in `task schedule`, SHALL only add fields, so that installed skills keep working.
5. WHEN the user runs `dibujo skills install`, THE CLI SHALL update the installed `morning-planning` skill.

## Decisions

1. **One note per year**, at `Future/YYYY.md` (Requirement 1.1).
2. **Entries stay until handled.** A due entry shows up every morning until it is brought in, pushed, or cancelled. Missing a day never makes it disappear (Requirement 3.5).
3. **Only daily tasks can go into the future log, for now.** Adding events and tasks directly is planned for a later spec (see the Introduction).
4. **Month-only entries stay in the future log.** The monthly migration spec handles them (Requirement 1.7).
5. **Morning planning does the migration** from the future log into today's daily log (Requirements 4.1 and 5.2).
6. **Rescheduling works like migrating.** The old entry is marked `[<]` and a new entry is added, so history stays readable and nothing the user wrote is rewritten (Requirement 4.2).
7. **Scheduling moves only the task itself.** Nested bullets stay behind and are reviewed on their own (Requirement 2.3).
8. **A returned task starts a new migration streak** (Requirement 4.8).
9. **An unreadable future log note is an error,** not something to skip, because skipping would hide entries that are meant to keep showing up (Requirement 3.9).

## Open questions for design

1. **Link syntax.** Origin links today are keyed by a daily note's date. They need to point at a future log note, which is keyed by year, and a future log entry needs to link to a daily task and the other way around.
2. **Month headings.** What does a heading look like (for example `## 2026-12 December`), and is a new note created with all 12 months, so the user can add entries by hand, or are months added as needed?
3. **Refs.** What a ref for a future log entry looks like, and how it relates to daily refs.
4. **Commands.** Whether the new commands live in a `future` group (`future show`, `future due`, and the three actions), or reuse `task` commands.
5. **Streaks.** How the link from a returned task to the future log is told apart from a link to the day before, and whether the scheduled-then-returned chain should be visible to the later reviews spec.
