# Requirements: flat future log

## Introduction

The `future-log` spec stores the future log as one note per year, with a heading for each month, and only tasks scheduled from a daily note can get into it. In use, that has two problems:

1. **There is no way to add to it directly.** The agent hand-wrote `Future/2026.md` with a heading dibujo couldn't read (`## December` instead of `## 2026-12 December`), so the entries were invisible. The strict month structure is easy to get wrong.
2. **It is more structure than a personal list needs.** Year notes, month sections, and reschedule chains make the format hard to write by hand and hard to explain.

This spec replaces that design with something simpler:

1. **One note.** The future log is a single plain note, `Future.md`. Every bullet in it is an entry. There are no years and no month headings.
2. **Dates are optional.** An entry can carry a date, and then it comes back when the date arrives. An entry without a date waits until the user looks at the list.
3. **Direct add.** A command adds tasks, events, and notes to the future log, with or without a date.
4. **Scheduling keeps working.** `task schedule` takes an optional date. Without one, it just moves the task to the future log.
5. **Morning planning.** Entries that are due are shown as before. After that, the user is asked whether to look at the rest of the future log, and picks which tasks to bring into today.
6. **Skills.** A new `future-log` skill covers adding entries, and the other skills are told never to edit the future log by hand.

This replaces the year notes and month sections of `future-log`. Everything else in that spec stays as it is unless a requirement below says otherwise: bringing an entry into a daily note, cancelling, origin links, streaks, atomic writes, `NOTE_CHANGED`, `--dry-run`, `--json`, and the "entries stay until handled" rule.

Out of scope, and planned for later specs:

- **Monthly migration.** The future log no longer has months, so an entry that only has a month is now an entry without a date. The monthly migration spec decides whether and how to handle those.
- **Bringing events and notes into a daily note.** Events dated today are shown in morning planning for information. Copying them into the daily log can come later.
- Evening reflection, reminders and notifications, and reviews.

Testing for this spec is limited to the core logic (parsing, adding, dates, moving entries between notes), not the command wiring or the skills.

## Glossary

Terms from the earlier specs (vault, daily note, bullet, task state, origin link, ref, journal date, block id) keep their meaning.

- **Future log**: the single note `Future.md`.
- **Entry**: one bullet in the future log.
- **Waiting entry**: a task entry in state open (`- [ ]`).
- **Dated entry**: a task with a `⏳ YYYY-MM-DD` date, or an event with a `📅 YYYY-MM-DD` date.
- **Undated entry**: an entry with no date.
- **Due entry**: a waiting, dated task whose date is today or earlier.
- **Today**: the current journal date.
- **Old year notes**: the `Future/YYYY.md` notes written by the `future-log` version of dibujo.

## Requirements

### Requirement 1: The future log note

**User story:** As the user, I want the future log to be one plain note that I can read and edit by hand, so that nothing I write in it can end up invisible.

#### Acceptance criteria

1. THE project SHALL store the future log as one note, at `<vault>/<dibujo folder>/Future.md`.
2. WHEN dibujo creates the note, THE CLI SHALL write the frontmatter fields `dibujo` (the format version) and `type: future`. dibujo SHALL NOT edit the frontmatter of an existing note.
3. THE CLI SHALL treat every bullet in the note, below the frontmatter, as an entry, wherever it is in the note. Headings and sections that the user adds are allowed and SHALL be kept unchanged. THE CLI SHALL NOT require any heading.
4. Entries SHALL use the same bullet syntax, task states, signifiers, and nesting as daily notes. A waiting task is `- [ ]`.
5. THE CLI SHALL give task states these meanings in the future log:
   - open (`[ ]`): waiting;
   - migrated (`[>]`): brought into a daily note;
   - cancelled (`[-]`): cancelled;
   - completed (`[x]`): completed by hand. dibujo never sets this state;
   - scheduled (`[<]`): written by the `future-log` version of dibujo when an entry was rescheduled. dibujo reads it and never sets it.
6. WHEN the CLI reads a line that is not blank, not a heading, and not a valid bullet, THE CLI SHALL keep the line unchanged and report it as unrecognized, and SHALL NOT fail or delete it.
7. IF the note has a format version newer than the CLI supports, THEN THE CLI SHALL NOT write to it, and SHALL exit with `NOTE_VERSION_UNSUPPORTED`.
8. THE CLI SHALL only append entries, change the checkbox character of an entry, add or change the date of an entry, and add a block id to an entry. IT SHALL NOT delete or rewrite anything else the user wrote. New entries go after the last non-blank line of the note.
9. WHEN the note doesn't exist, THE commands that read it SHALL treat it as empty. THE commands that write to it SHALL create it.

### Requirement 2: Dates on entries

**User story:** As the user, I want to give an entry a date when I know it, and leave it undated when I don't, so that dated things come back on their own and the rest wait for me to look.

#### Acceptance criteria

1. A task MAY have a `⏳ YYYY-MM-DD` date, as in daily notes.
2. AN event MAY have a `📅 YYYY-MM-DD` date, written at the end of the line like the task date. The field applies to events only, because `⏳` and `📅` mean something to the Tasks plugin on tasks. On a task or a note, `📅` is part of the text.
3. A note SHALL NOT have a date.
4. AN entry without a date SHALL be valid and kept. It is never due, and it is listed with the other waiting entries (Requirement 5).
5. THE CLI SHALL NOT place or move an entry based on its date. The position of an entry in the note is the order in which it was added.
6. A date SHALL NOT be earlier than today when the CLI sets it. Today is allowed.
7. WHEN the user edits an entry by hand and adds, changes, or removes a date, THE CLI SHALL use what is in the line.

### Requirement 3: Scheduling a task

**User story:** As the user, when I move a task to the future log on paper, I want dibujo to do the same, with a date if I have one and without if I don't.

#### Acceptance criteria

1. THE command `dibujo task schedule <ref> [date]` SHALL take an optional date.
2. WITH a date, THE CLI SHALL mark the daily task `[<]` with its `⏳` date and a block id, and add a waiting entry with the same date to the future log, as `task schedule` does today except for where the entry goes.
3. WITHOUT a date, THE CLI SHALL mark the daily task `[<]`, with a block id and no `⏳` date, and add a waiting entry with no date.
4. THE entry SHALL keep the task's text and signifiers, and SHALL link back to the task in the daily note with an origin link. THE CLI SHALL NOT copy nested bullets into the future log.
5. WHEN the date is given, it SHALL be after the daily note's date, as today.
6. THE CLI SHALL write the daily note first and the future log second. IF scheduling is interrupted between the two writes, THEN running the same command again SHALL finish it without adding a second entry.
7. WHEN the task is already `[<]` and has a waiting entry, THEN `task schedule` SHALL update the date of that task and of its entry to the new date, in place, and SHALL NOT add a second entry. WHEN no date is given, it SHALL leave both dates as they are.
8. WHEN the task is already `[<]` and has no entry, because it was scheduled before the future log existed, THEN running `task schedule` again SHALL add the entry.
9. THE CLI SHALL read the future log and check its format version before it writes anything. IF the future log can't be written, THEN `task schedule` SHALL change nothing.
10. THE command SHALL support `--dry-run` and `--json`. THE `--json` output SHALL keep the existing fields and only add to them.

### Requirement 4: Adding to the future log directly

**User story:** As the user, I want to say "put the dentist on the future log for December 12" or "add 'learn Rust' to my future log", and have it written in the right format, so that nobody has to edit the file by hand.

#### Acceptance criteria

1. THE CLI SHALL provide `dibujo future add`, which reads JSON from stdin and adds one or more entries to the future log. It follows the rules for `log add` for stdin, and SHALL NOT wait for input when stdin is a terminal.
2. EACH entry in the input SHALL have a `type` (`task`, `event`, or `note`) and `text`, and MAY have `signifiers`. A task or an event MAY have a `date`. Unknown fields are rejected. THE text rules for `log add` apply: it must be one line, and must not contain the fields dibujo writes itself.
3. THE CLI SHALL write each entry as a bullet in the future log: a task as `- [ ] text`, an event as `* text`, a note as `- text`. A date is written in the field for its type (Requirement 2). THE CLI SHALL add no origin link and no block id.
4. THE CLI SHALL reject a date that is not `YYYY-MM-DD`, is earlier than today, or is given on a note.
5. THE CLI SHALL NOT add an entry that is the same as an entry that is already in the note and still waiting (same type, text, signifiers, and date). Running the same command twice adds the entries once. Events and notes count as waiting.
6. THE CLI SHALL create the note when it doesn't exist.
7. THE CLI SHALL check the format version of the note before it writes.
8. THE command SHALL support `--dry-run` and `--json`, and SHALL write atomically with the same `NOTE_CHANGED` check as `dibujo log add`. IF any entry in the input is invalid, THEN THE CLI SHALL add none of them.

### Requirement 5: Reading the future log

**User story:** As the agent running morning planning, I want to read the future log and see what is due and what else is waiting, so that I can walk the user through it.

#### Acceptance criteria

1. `dibujo future show` SHALL read the future log. WITH `--json` it SHALL print the entries in the order they are in the note (type, state, signifiers, text, depth, date, origin, and ref), and any unrecognized lines. IF the note doesn't exist, it SHALL report that and exit with code 0, printing an empty result with `--json`.
2. EACH entry SHALL have a ref that works with the commands in Requirement 6 and keeps working when lines are added or removed above it. IF no single entry matches a ref, THEN THE commands SHALL change nothing and exit with `TASK_NOT_FOUND`.
3. `dibujo future due` SHALL list the due entries, using `--date` to choose another day as "today" when needed. IT SHALL list them by date, then by their position in the note. FOR each entry it SHALL print the ref, text, signifiers, date, the number of days overdue (0 on the day itself), and the date of the daily note it was scheduled from when that is known.
4. A due entry SHALL stay in the list every day until it is handled.
5. `dibujo future due --json` SHALL also list, in additional fields:
   - **the events dated today**, with their text and signifiers;
   - **the other waiting tasks**, meaning waiting tasks that are undated or dated after today, with their ref, text, signifiers, and date if any, in the order they are in the note.
6. THE CLI SHALL NOT list entries that are not waiting as due or waiting, or notes, or events dated on any day but today, in those fields.
7. WHEN there is nothing to list, or the note doesn't exist, THE commands SHALL return empty lists and exit with code 0.
8. IF the note has an unsupported format version, THEN THE commands SHALL exit with `NOTE_VERSION_UNSUPPORTED`, naming the note.
9. IF old year notes exist and haven't been moved yet (Requirement 9), THEN THE commands SHALL still work on `Future.md`, and SHALL include the paths of the old notes in a `legacyNotes` field and say in plain output that `dibujo future import` should be run.

### Requirement 6: Handling an entry

**User story:** As the user, I want to bring a task into today, give it a date or move its date, or drop it, the way I would on paper.

#### Acceptance criteria

1. **Bring in.** `dibujo future migrate <ref>` SHALL mark a waiting task entry `[>]` with a block id and add an open task to a daily note, which is today's by default, with the same text and signifiers and a link back to the entry. WITH `--priority`, the new task SHALL also get the priority signifier. This works on dated and undated tasks.
2. **Set or change the date.** `dibujo future reschedule <ref> <date>` SHALL set the date of a waiting task entry, or change it, in place. It SHALL NOT mark the entry `[<]` and SHALL NOT add a second entry. THE date SHALL be later than today. This works on undated entries too.
3. **Cancel.** `dibujo future cancel <ref>` SHALL mark a waiting task entry `[-]`.
4. THE CLI SHALL change an existing entry only in the ways Requirement 1.8 allows, and SHALL check every edit as it does for daily notes. IT SHALL refuse and write nothing if an edit would change anything else on a line or any other line.
5. IF bringing in is interrupted after the first note is written but before the second, THEN running the same command again SHALL finish it without adding a second copy.
6. WHEN the target daily note doesn't exist, THE CLI SHALL create it.
7. THE CLI SHALL check the format version of every note it will write before it writes any of them.
8. A task brought into a daily note SHALL be a normal open task from then on. ITS migration streak SHALL start at 0.
9. IF the ref points to something that is not a task, THEN THE CLI SHALL exit with `NOT_A_TASK`. IF the entry is not waiting, THEN bringing in and setting a date SHALL exit with `TASK_NOT_OPEN`.
10. THE commands SHALL support `--dry-run` and `--json`, and SHALL write atomically with the same `NOTE_CHANGED` check as `dibujo log add`.

### Requirement 7: Origin links

**User story:** As the user, I want the links between the daily notes and the future log to keep working in Obsidian, without the year in them.

#### Acceptance criteria

1. THE link from an entry or a copy back to the future log SHALL point at the single note, for example `[[Bujo/Future#^m4n5p6|from future log]]`. It SHALL follow the rules for origin links in `docs/vault-format.md`: the full path, an alias that is not part of the text, and the block id on the target.
2. THE CLI SHALL still read origin links written by the `future-log` version, such as `[[Bujo/Future/2026#^m4n5p6|from future log 2026]]`, as links to the future log. IT SHALL NOT write that form.
3. A task whose origin is the future log SHALL start its migration streak at 0, as today.
4. THE rule that a link is an origin link only when its target and folder agree SHALL hold for the new form. Any other link stays in the text.

### Requirement 8: Morning planning

**User story:** As the user, I want my morning planning to show me what has come due, tell me about today's events, and offer to go through the rest of my future log, so that I decide what to bring in once, at the start of the day.

#### Acceptance criteria

1. THE `morning-planning` skill SHALL run these steps in this order: migration of yesterday's tasks, due future log entries, today's events, the rest of the future log, brain-dump, priority, confirm and save.
2. **Due entries:** THE skill SHALL go through the due entries one at a time, as it does now: bring into today, push to another date (changing the date in place), cancel, or leave for now. IT SHALL say how many days overdue an entry is, when it is overdue, in a neutral way, without recommending an answer.
3. **Today's events:** WHEN `future due` lists events dated today, THE skill SHALL tell the user about them in one message, for information only. IT SHALL NOT ask the user to do anything with them.
4. **The rest of the future log:** WHEN `future due` lists other waiting tasks, THE skill SHALL ask once, "Would you like to take a look at your future log?" WHEN the user says yes, IT SHALL show those tasks as a numbered list, and let the user choose which ones to bring into today, with the option of choosing none. WHEN the user says no, the step ends. THE skill SHALL show no list and ask nothing when there are no other waiting tasks.
5. THE skill SHALL let the user also give a date to, or cancel, a task in that list, with the same commands as for due entries.
6. WHEN an entry is left, THE skill SHALL leave it unchanged. Dated entries are listed again the next morning, and undated ones whenever the user looks.
7. THE skill SHALL let the user skip the step, or any prompt in it, by saying so ("skip", "nothing", "no").
8. **Priority:** THE skill SHALL let the user name entries they are bringing in as most important today, and SHALL mark them with `--priority`.
9. **Migration:** WHEN the user schedules a task in the migration step and gives no date, THE skill SHALL ask once whether it has a date, and SHALL accept "no" as an answer, in which case it schedules the task without a date.
10. **Confirm and save:** THE confirmation SHALL show the changes to the future log together with the other changes, using Bullet Journal symbols. THE agent SHALL save only after the user confirms, in the same order as now.
11. THE skill SHALL instruct the agent to make every change through `dibujo` commands with `--json`, and never to edit vault files directly, and to report failures as it does now.

### Requirement 9: The future-log skill, the other skills, and moving old notes

**User story:** As the user, I want the agent to know how to add to the future log, and my existing future log entries to come along.

#### Acceptance criteria

1. A new `future-log` skill SHALL guide the agent through adding entries: it SHALL turn what the user says into tasks, events, and notes with short text, ask for a date only when the user hints at one ("on Dec 12", "next Friday", "in March"), work out `YYYY-MM-DD`, and call `dibujo future add --json`. IT SHALL NOT pad or reword the user's words.
2. WHEN the user gives only a month ("in March"), THE skill SHALL ask for a day, and add the entry undated if the user doesn't have one. It SHALL NOT write the month into the text.
3. THE skill SHALL show what it will add, using Bullet Journal symbols, and save only after the user confirms.
4. THE skill SHALL also cover reading ("what's in my future log?") with `dibujo future show --json`, and giving a date to, bringing in, or cancelling an entry.
5. THE `daily-log` and `morning-planning` skills SHALL each say that the future log is changed only through `dibujo` commands, never by editing `Future.md` or anything under `Future/`, and that requests to add something to the future log use the `future-log` skill.
6. THE skill SHALL follow the layout rules in `.kiro/steering/structure.md`: the `name` and `description` frontmatter only, and a link to `references/vault-format.md`.
7. **Moving old notes.** THE CLI SHALL provide `dibujo future import`, which copies the entries of old year notes into `Future.md`:
   - waiting tasks, events, and notes are copied, including their dates and links. Tasks in other states are not copied. A link to a rescheduled entry is replaced by the link at the start of that chain, so the copy points at the daily task it came from;
   - the old notes are never changed, moved, or deleted, so links in daily notes that point to them keep resolving;
   - running it again adds nothing that was already copied;
   - `--dry-run` and `--json` are supported.
8. WHEN the old year notes contain a waiting entry that is not a valid entry (for example, a heading the CLI can't read), THE command SHALL report the lines it did not copy.
9. THE `dibujo skills install` command SHALL install the new skill and update the others.

### Requirement 10: The vault format document and compatibility

**User story:** As the user, I want the format written down, and my existing notes to keep working.

#### Acceptance criteria

1. `docs/vault-format.md` SHALL describe the new future log note: its location, frontmatter, entries and dates, task states, the new origin link, and how an entry is decided to be due. IT SHALL remove the description of year notes and month sections, and say how old year notes are read (Requirement 9.7).
2. Daily notes written by the `future-log` version SHALL still be read correctly, including their old-form future links.
3. THE format version SHALL stay at 1, because the future log has not been in a published release. IF the design finds that it can't, THEN it SHALL explain why.
4. THE changes to existing `--json` output SHALL only add fields, so that installed skills keep working, with these exceptions, which the design SHALL list: the `year` and `months` fields of `future show`, and the rescheduled-entry fields of `future reschedule`, which no longer apply.
5. WHEN the user runs `dibujo skills install`, THE CLI SHALL update the installed skills.

## Decisions

1. **One note, `Future.md`.** No years, no months (Requirement 1).
2. **Dates are optional,** on tasks (`⏳`) and events (`📅`) (Requirement 2).
3. **Month-only entries become undated entries.** The monthly migration spec decides what to do with them later.
4. **Rescheduling changes the date in place,** instead of marking the old entry `[<]` and adding a new one. History in the file is not kept, but the file stays short and easy to read.
5. **`task schedule` keeps the link back to the daily task,** and takes an optional date.
6. **No raw text is kept for direct adds.** Entries are already short, and the future log should read like a list.
7. **Today's events are shown but not brought in** (Requirement 8.3).
8. **Only tasks can be brought into a daily note,** as before.
9. **A new `future-log` skill,** instead of extending `daily-log`.
10. **Old year notes are copied, not moved** (Requirement 9.7).
11. **The format version stays at 1.**

## Open questions for design

1. **Refs.** What a ref looks like without a year. It should survive lines being added above it, as `line:fingerprint` does now, and it must tell identical entries apart.
2. **Origin link in code.** How `FutureOrigin` changes from `{ year, blockId }`, and how old year-form links are read as future origins.
3. **Finding an entry from its daily task.** How scheduling, re-scheduling, and bringing in find the entry for a given task now that there is one note, and what is left of the chain-following code.
4. **Where to read from.** How the commands deal with the old `Future/` folder, and what `future import` does when `Future.md` already has entries.
5. **Fields on events.** The exact place of the `📅` date in the line relative to tags and the other fields, and how the parser treats it on a task or a note.
6. **Which `--json` fields change,** to fill in Requirement 10.4.
