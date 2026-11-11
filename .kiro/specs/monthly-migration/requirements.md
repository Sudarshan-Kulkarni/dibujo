# Requirements: monthly migration

## Introduction

This spec adds the second Bullet Journal ritual: monthly migration. At the start of a month, the agent walks the user through what the past month left behind and writes a short summary of it:

1. **Leftover tasks.** Go through every task still open in the past month's daily notes, one at a time: migrate it to today, schedule it, cancel it, complete it, or leave it.
2. **The future log.** Go through the future log tasks that are still waiting with no date, or whose date has passed: bring into today, give a date, cancel, or leave.
3. **Confirm and save the changes.** The agent shows the changes from the first two steps and saves them only after the user confirms.
4. **Summary.** Write a monthly note for the past month with fixed sections: highlights, the number of tasks done, the tasks that kept moving, and themes and intentions. The agent shows the summary and saves it only after the user confirms.

Morning planning offers the ritual on the first morning of a new month, and keeps offering it each morning until the past month's summary is written. The user can also start it directly.

This closes two gaps the earlier specs left for monthly migration:

- `task review` only lists yesterday's open tasks (`morning-planning`, Requirement 4.7). A task left open on any other day is never brought up again.
- Undated future log entries never come up unless the user asks to look at the list (`flat-future-log`, Decision 3).

The paper monthly log (a calendar and a task list for the month) is **not** mirrored. The monthly note holds only the summary.

Out of scope, and planned for later specs: a monthly calendar or task list, yearly reviews, reminders and notifications, and open tasks from months before the past month.

This spec builds on `core-daily-log`, `morning-planning`, and `flat-future-log`. Vault format, CLI behavior, atomic writes, `NOTE_CHANGED` handling, refs, origin links, `--json`, and `--dry-run` follow those specs and `.kiro/steering/tech.md`, and are not repeated here.

Testing for this spec is limited to the core logic (finding leftover tasks, counting, the moving tasks, the monthly note, the pending check), not the command wiring or the skills.

## Glossary

Terms from the earlier specs (vault, daily note, bullet, task state, origin link, ref, journal date, block id, future log, waiting entry, flag threshold) keep their meaning.

- **Today**: the current journal date.
- **Month**: a calendar month, written `YYYY-MM`.
- **Past month**: the month before the month of today.
- **Leftover task**: an open task in a daily note of the month that isn't moved along with an open parent task (the same rule `task review` uses for yesterday).
- **Leftover entry**: a waiting task in the future log that has no date, or whose date is before today.
- **Monthly note**: the note that holds the summary of one month.
- **Moving task**: a task that was migrated or scheduled from one note to another several times during the month (Requirement 4).
- **Pending month**: the past month, when it has at least one daily note and no monthly note with a summary.

## Requirements

### Requirement 1: Reading a month

**User story:** As the agent running monthly migration, I want everything from the past month in one call, so that I can walk the user through it and draft the summary.

#### Acceptance criteria

1. THE CLI SHALL provide a command that reads one month. It SHALL default to the past month, and SHALL accept a month (`YYYY-MM`) and `--date` to choose another day as "today", like `task review`.
2. THE command SHALL refuse the month of today and any later month with `INVALID_DATE`, because the month isn't over.
3. WITH `--json`, THE command SHALL print:
   - the month, and the path and date of each daily note in it, in date order;
   - every bullet in those notes (type, state, signifiers, text, depth, date, and ref), so the agent can draft the summary without reading files;
   - the leftover tasks (Requirement 2);
   - the counts and the moving tasks (Requirement 4);
   - whether the monthly note exists and whether it has a summary, and its path.
4. A month with no daily notes SHALL return empty lists and zero counts, and exit with code 0.
5. A daily note with an unsupported format version SHALL NOT stop the command. THE command SHALL leave its bullets out, and SHALL list its path in a separate field, so the agent can tell the user it was skipped.
6. THE command SHALL NOT write anything.

### Requirement 2: Leftover tasks

**User story:** As the user, I want to see every task I left open last month, not just yesterday's, so that nothing slips away unnoticed.

#### Acceptance criteria

1. THE command in Requirement 1 SHALL list the leftover tasks of the month, oldest note first, then in note order.
2. FOR each leftover task it SHALL print its ref, the date of its note, its text, signifiers, depth, and the bullets that would move with it when it is migrated, in the same shape as `task review`.
3. A task that was already migrated, scheduled, completed, or cancelled SHALL NOT be listed.
4. THE existing commands SHALL handle leftover tasks without change: `task migrate` (to today), `task schedule`, and `task set`. No new command SHALL be needed to change a leftover task.

### Requirement 3: Leftover future log entries

**User story:** As the user, I want my monthly migration to go through the future log tasks that have no date or whose date has passed, so that they don't wait forever.

#### Acceptance criteria

1. THE skill SHALL find the leftover entries with the existing `future due --json` output: the due entries dated before today, and the waiting entries with no date.
2. Entries dated today or later SHALL NOT be part of this step. Entries due today come up in morning planning.
3. THE existing commands SHALL handle them: `future migrate`, `future reschedule`, and `future cancel`.
4. IF the existing output can't tell these entries apart, THEN the design SHALL add fields to it. It SHALL only add fields.

### Requirement 4: Counts and moving tasks

**User story:** As the user, I want the numbers in my summary to be exact, so that they are counted, not guessed.

#### Acceptance criteria

1. THE CLI SHALL count, across the daily notes of the month, the tasks in each state: completed, cancelled, migrated, scheduled, and open. The agent SHALL NOT count them itself.
2. **Tasks done** is the number of completed tasks in the month's daily notes. A task SHALL be counted once, even when it was migrated across several notes before it was completed, because only its last copy is completed.
3. THE CLI SHALL find the moving tasks by following origin links between the month's notes, the same way migration streaks are followed. A task is moving when, during the month, it was migrated or scheduled out of a note at least as many times as the flag threshold (`migrationFlagDays`). The days don't need to be in a row.
4. FOR each moving task, THE CLI SHALL print its latest text, the number of times it moved during the month, the date it first appeared in the month, and the state of its last copy in the month.
5. THE CLI SHALL list each moving task once, even when its chain passes through many notes.
6. A broken origin link SHALL end a chain without an error, as it does for streaks.

### Requirement 5: The monthly note

**User story:** As the user, I want a short note for each month that I can read and edit in Obsidian, next to my daily notes.

#### Acceptance criteria

1. THE project SHALL store the monthly note at `<vault>/<dibujo folder>/Monthly/YYYY-MM.md`, through `resolveInVault`.
2. WHEN dibujo creates the note, THE CLI SHALL write the frontmatter fields `dibujo` (the format version), `type: monthly`, and `month`. dibujo SHALL NOT edit the frontmatter of an existing note.
3. THE summary SHALL have these sections, in this order, each under its own heading:
   - **Highlights**: a few short bullets about what happened in the month;
   - **Tasks done**: the number from Requirement 4.2, written by the CLI;
   - **Tasks that kept moving**: the moving tasks from Requirement 4, by name, with how many times each moved, written by the CLI;
   - **Themes and intentions**: a few short bullets about the themes of the month and the user's intentions for the next one.
4. THE sections SHALL be plain Markdown that reads well in Obsidian with no plugins. The note SHALL hold no data blobs.
5. WHEN a section has nothing in it, THE CLI SHALL still write its heading, with a short line saying there was nothing, so that every monthly note has the same shape.

### Requirement 6: Writing the summary

**User story:** As the agent, I want one command that writes the summary, so that the monthly note is always in the right format.

#### Acceptance criteria

1. THE CLI SHALL provide a command that writes the summary of a month. It SHALL read JSON from stdin with the highlights, themes, and intentions as lists of short text, and follow the rules for `log add` for stdin. It SHALL NOT wait for input when stdin is a terminal.
2. THE CLI SHALL compute **Tasks done** and **Tasks that kept moving** itself when it writes, from the notes on disk. The input SHALL NOT contain them.
3. EACH text SHALL be one line. THE text rules for `log add` apply. Unknown fields are rejected. IF any part of the input is invalid, THEN THE CLI SHALL write nothing.
4. THE command SHALL refuse the month of today and any later month, as Requirement 1.2 does.
5. WHEN the monthly note doesn't exist, THE CLI SHALL create it. WHEN it exists and has no summary, THE CLI SHALL append the summary after the last non-blank line, and keep everything the user wrote.
6. WHEN the note already has a summary, THE CLI SHALL NOT overwrite or add to it. IF the input is the same as what is written, THEN THE CLI SHALL report `unchanged` and exit with code 0, so an interrupted run can be repeated. OTHERWISE it SHALL exit with an error that tells the user to edit the note by hand in Obsidian.
7. THE command SHALL support `--dry-run` and `--json`, and SHALL write atomically with the same `NOTE_CHANGED` check as `dibujo log add`.
8. THE CLI SHALL check the format version of an existing monthly note before it writes, and SHALL exit with `NOTE_VERSION_UNSUPPORTED` when it is newer than supported.

### Requirement 7: Knowing when the ritual is due

**User story:** As the user, I want morning planning to remind me when last month hasn't been migrated, even if I miss the 1st.

#### Acceptance criteria

1. THE CLI SHALL report the pending month (see the glossary), or that there is none, from a command that morning planning already runs, by adding a field to its `--json` output. It SHALL only add fields.
2. ONLY the past month SHALL be reported. Older months without a summary SHALL NOT be reported, so a user who starts using dibujo mid-year is not asked about months before it.
3. A month SHALL stop being pending as soon as its monthly note has a summary.
4. THE check SHALL be cheap: it SHALL NOT read every note of the month.

### Requirement 8: Monthly migration skill

**User story:** As the user, I want to say "do my monthly migration" and be guided through last month's leftovers and its summary.

#### Acceptance criteria

1. THE package SHALL include a `monthly-migration` skill whose `description` tells an agent to use it when the user wants to do their monthly migration, review or summarize last month, or clear out last month's open tasks, and when morning planning offers it.
2. THE skill SHALL run these steps in this order: leftover tasks, leftover future log entries, confirm and save the changes, summary, confirm and save the summary.
3. **Leftover tasks:** THE skill SHALL go through the leftover tasks one at a time, oldest first, showing each with its date and children, and ask what the user did with it on paper: migrate to today, schedule (with a date or without), cancel, complete, or leave open. It SHALL use the same choices, wording, and child-task rules as morning planning.
4. WHEN the user schedules a leftover task with a date, THE date SHALL be after today. WHEN the user leaves a task open, THE skill SHALL say, once and neutrally, that it won't come up again in a ritual. It SHALL NOT recommend any choice.
5. WHEN there are many leftover tasks, THE skill SHALL let the user give the same answer for all the remaining ones ("cancel the rest", "leave the rest").
6. **Leftover future log entries:** THE skill SHALL go through them one at a time: bring into today, give a date (after today), cancel, or leave. Undated entries that are left stay in the future log as they are.
7. **Summary:** after the changes from the first two steps are saved, THE skill SHALL read the month again, so the counts include the user's choices, and draft:
   - **Highlights:** a few short bullets, from the month's events, notes, and completed tasks, in the user's words, with no added detail or comment;
   - **Themes and intentions:** a few short bullets for the themes, drawn only from what is in the notes; then it SHALL ask the user once for their intentions for the new month, and use their words. The user may say none.
8. THE skill SHALL show the counts and moving tasks from the CLI as they are, and SHALL NOT change them.
9. **Confirm and save, in two parts:** before the summary, THE skill SHALL show the changes to the leftover tasks and the future log together, using Bullet Journal symbols, and save them only after the user confirms. After drafting the summary, it SHALL show the whole summary as it will appear, and save it only after the user confirms. In both parts, THE agent SHALL apply edits and show the result again if anything changed.
10. **Skipping:** THE skill SHALL skip any step that has nothing in it, and SHALL let the user skip any step or prompt by saying so. The summary SHALL be skippable, in which case the month stays pending.
11. WHEN the month already has a summary, THE skill SHALL say so, show its path, and still offer the first two steps.
12. THE skill SHALL accept another past month when the user names one ("do my migration for September").
13. THE skill SHALL instruct the agent to make every change through `dibujo` commands with `--json`, never to edit vault files directly, and to report exactly which changes were saved and which were not, as morning planning does.
14. THE skill SHALL follow the layout rules in `.kiro/steering/structure.md`: the `name` and `description` frontmatter only, and a link to `references/vault-format.md`.

### Requirement 9: Morning planning offers it

**User story:** As the user, I want my morning planning to tell me when it's time for the monthly migration, without starting it on its own.

#### Acceptance criteria

1. WHEN there is a pending month (Requirement 7), THE `morning-planning` skill SHALL, after its report step, ask once: "It's a new month. Would you like to do the monthly migration for {month} now?"
2. WHEN the user says yes, THE agent SHALL load and follow the `monthly-migration` skill. WHEN the user says no or later, THE morning planning SHALL end, and the offer SHALL come again the next morning while the month is pending.
3. THE offer SHALL come after the morning planning has saved its changes, so the two rituals never share a confirmation step, and yesterday's tasks are already handled when the monthly migration starts.
4. THE morning planning steps SHALL otherwise not change.
5. WHEN there is no pending month, THE skill SHALL say nothing about it.

### Requirement 10: The vault format document and compatibility

**User story:** As the user, I want the monthly note written down, and my existing notes to keep working.

#### Acceptance criteria

1. `docs/vault-format.md` SHALL describe the monthly note: its location, frontmatter, sections, what dibujo writes in each, and that a note with a summary is never changed by dibujo.
2. THE format version SHALL stay at 1, because this adds a new kind of note and changes no existing one. IF the design finds that it can't, THEN it SHALL explain why.
3. Daily notes and the future log SHALL NOT change format.
4. THE changes to existing `--json` output SHALL only add fields.
5. THE README skills table SHALL list `monthly-migration`, with what it does and example phrases.
6. WHEN the user runs `dibujo skills install`, THE CLI SHALL install the new skill and update `morning-planning`.

## Decisions

1. **One skill for migration and the summary.** The summary comes last, after the changes are saved, so its numbers include the user's choices. That needs two confirmations instead of one (Requirements 8.7 and 8.9).
2. **No monthly calendar or task list.** The paper notebook keeps those. The monthly note holds only the summary (Requirement 5).
3. **Leftover tasks go to today's note.** There is no monthly task list to migrate into (Requirement 2.4).
4. **Offered by morning planning, never started by it.** The offer comes after its save, and keeps coming while the past month is pending, so missing the 1st doesn't lose it (Requirements 7 and 9).
5. **Only the past month is offered.** Older months can be done by naming them (Requirements 7.2 and 8.12).
6. **Numbers come from the CLI.** Tasks done and moving tasks are computed when the summary is written, not counted by the agent (Requirements 4 and 6.2).
7. **"Kept moving" uses the flag threshold**, counting moves in the month whether or not the days are in a row (Requirement 4.3).
8. **The summary is the agent's draft, in the user's words where possible.** It is labelled as a summary, drawn only from the notes, and saved only after the user confirms. The daily notes stay the record (Requirement 8.7).
9. **A written summary is never changed by dibujo.** The user edits it by hand (Requirement 6.6).
10. **Intentions come from the user.** The agent drafts themes from the notes, but asks the user for intentions for the new month (Requirement 8.7).

## Open questions for design

1. **Command names and shape.** For example a new `month` group with `month show [YYYY-MM]` (Requirement 1) and `month summary [YYYY-MM]` (Requirement 6), and how they register.
2. **Where the pending month is reported.** `task review` and `future due` are both run by morning planning. Which one gets the field, or whether both do (Requirement 7.1).
3. **How the CLI recognizes a summary** in a monthly note the user may have edited, for Requirements 6.5, 6.6, and 7.3. For example by its headings, or by a marker that stays readable.
4. **Moving tasks across the month boundary.** Whether moves into the first note of the month from the month before count, and how a scheduled task brought back from the future log joins its chain (Requirement 4.3).
5. **Links in the summary.** Whether a moving task's name links back to its last copy in a daily note, which would need a block id added to that line (Requirement 5.3).
6. **Leftover entries in `future due`.** Whether the existing fields are enough to find the leftover entries, or which field to add (Requirement 3.4).
7. **Output size.** Whether Requirement 1.3's full list of bullets needs a limit or a separate flag for long months.
