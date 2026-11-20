# Requirements: morning review fallback

## Introduction

This is a bug-fix spec for `morning-planning`.

**The bug.** `dibujo task review` only looks at yesterday's note (the calendar day before today). When yesterday has no note, it returns an empty list, and the morning ritual says "Nothing open from yesterday." Open tasks in the last note the user did write (for example, from Friday when today is Monday) are never offered for migration.

**Verified in the code (2026-11-20).**

- `reviewTasks` in `src/vault/tasks.ts` sets `yesterday = addDays(today, -1)` and returns `{ exists: false, tasks: [] }` when that note is missing.
- `src/cli/task-review.ts` prints `No note for <yesterday>` and stops.
- `skills/morning-planning/SKILL.md` step 2 treats an empty `data.tasks` as "Nothing open from yesterday" and moves on.
- The original spec chose this on purpose (`morning-planning` Decision 1: "Yesterday is the previous calendar day, not the most recent note", and Requirement 4.7). This spec reverses that decision for the case where yesterday has no note.

**The fix.** When yesterday has no note, the review uses the most recent earlier daily note instead. When the note used is not yesterday's, the user is told which day it is from and that there are no notes in between. The rest of the ritual continues as before.

This spec builds on `core-daily-log` and `morning-planning`. Vault format, CLI behavior, atomic writes, `--json`, `--dry-run`, and refs follow those specs and `.kiro/steering/tech.md`, and are not repeated here.

Out of scope: reviewing more than one older note, reviewing older notes when yesterday's note exists, and changing the monthly migration.

## Glossary

Terms from `core-daily-log` and `morning-planning` keep their meaning.

- **Today**: the current journal date, or the `--date` value.
- **Yesterday**: the calendar day before today.
- **Source day**: the day whose open tasks the review lists. Yesterday when yesterday has a note. Otherwise the most recent day before today that has a daily note.
- **Gap**: the number of calendar days strictly between the source day and today that have no note. When the source day is yesterday, the gap is 0.
- **Fallback**: the source day is not yesterday.

## Requirements

### Requirement 1: Choosing the source day

**User story:** As the user, when I skipped logging yesterday, I want my morning planning to pick up from my last real note, so that my open tasks are not lost.

#### Acceptance criteria

1. WHEN yesterday's note exists, THE review SHALL use yesterday as the source day, exactly as before. This holds even when yesterday's note has no open tasks.
2. WHEN yesterday's note does not exist, THE review SHALL use the most recent daily note dated before today as the source day.
3. THE search SHALL look across all months and years in the `Daily/` folder, not only the current month.
4. THE search SHALL ignore notes dated today or later, and files in `Daily/` whose names are not real `YYYY-MM-DD.md` dates.
5. IF no daily note exists before today, THEN THE review SHALL return an empty list, with no source day, and exit with code 0.
6. IF the most recent earlier note exists but has no open tasks, THEN THE review SHALL return an empty list for that source day. It SHALL NOT keep searching further back.
7. IF the most recent earlier note cannot be read by this version of dibujo, THEN THE CLI SHALL fail with the same error it gives for an unreadable yesterday note.

### Requirement 2: Reporting the fallback

**User story:** As the user, I want to be told when the tasks come from an older day, so that I don't think they are from yesterday.

#### Acceptance criteria

1. THE `--json` output SHALL keep the existing fields (`today`, `yesterday`, `path`, `exists`, `flagAfterDays`, `tasks`, `pendingMonth`), with `path` and `exists` describing yesterday's note, so that existing consumers keep working.
2. THE `--json` output SHALL add `source`: `null` when no source day was found, otherwise an object with `date`, `path`, `isYesterday` (boolean), and `gapDays` (whole number, 0 when `isYesterday` is true).
3. THE `ReviewTask.streak` and `since` fields SHALL be computed from the source day, with the rules of `morning-planning` Requirement 4.3 and 4.4 unchanged. A task whose origin link points at a day other than the day before the source day has a streak of 0.
4. THE human-readable output SHALL, in a fallback, say that yesterday has no note, name the source day with its weekday, and say how many days have no note between it and today. Example: `No note for 2026-11-19. Showing open tasks from Friday 2026-11-16 instead (2 days with no notes in between).`
5. IF the gap is 1 day, THE text SHALL say "1 day", not "1 days".
6. THE human-readable output for the case where no source day exists SHALL say there are no earlier notes.

### Requirement 3: Migrating from the source day

**User story:** As the user, I want to migrate those tasks into today the normal way.

#### Acceptance criteria

1. THE refs in the review output SHALL carry the source day's date, so that `task set`, `task schedule`, and `task migrate` work on them without any change.
2. WHEN a task is migrated from a source day that is not yesterday, THE copy in today's note SHALL link back to the source day's task, and THE source task SHALL be marked migrated. This is the existing behavior of `task migrate` and SHALL NOT change.
3. THE `task migrate`, `task set`, and `task schedule` commands SHALL NOT need new flags for this fix.
4. THE rule in `morning-planning` that a scheduled date must be after yesterday SHALL become: after the source day, and not today or earlier. (Scheduling to a date between the source day and today is therefore refused as a past date.)

### Requirement 4: Morning planning skill

**User story:** As the agent running the ritual, I want clear instructions for the fallback case, so that I tell the user and carry on.

#### Acceptance criteria

1. THE skill SHALL read `data.source` after `task review --json`.
2. WHEN `data.source.isYesterday` is false, THE skill SHALL tell the user, before listing any task, that this is not yesterday: the tasks are from `<weekday> <date>`, and no notes exist for the days in between.
3. THE skill SHALL then continue the normal flow: one task at a time, the same choices, the same confirm step.
4. THE skill SHALL use the source day's date in its wording ("from Friday"), not "yesterday", in the task prompts and in the plan summary.
5. WHEN `data.source` is `null`, THE skill SHALL say there are no earlier notes and go to the brain-dump step.
6. WHEN `data.source` is set and `data.tasks` is empty, THE skill SHALL say "Nothing open from `<weekday> <date>`." Then it goes to the next step. It adds the not-yesterday notice first when that applies.
7. THE skill SHALL NOT ask the user to create the missing notes, and SHALL NOT write anything for the missing days.

### Requirement 5: Docs and tests

#### Acceptance criteria

1. `docs/vault-format.md` does not change, because no note format changes.
2. THE `task review` section of any user-facing docs and `skills/morning-planning/SKILL.md` SHALL describe the new `source` field and the fallback.
3. Tests SHALL cover: yesterday exists with tasks; yesterday exists and is empty; yesterday missing with a note 2 days back; a gap that crosses a month end and a year end; no earlier notes; only future-dated notes; a non-date file in `Daily/`; an earlier note with no open tasks; and the plural wording.
4. A test SHALL migrate a task from a fallback source day and check the link and the migrated mark.

## Decisions

1. **Only yesterday-missing triggers the fallback.** When yesterday has a note, behavior is unchanged, including when it is empty. This keeps `morning-planning` Requirement 4.7 true for that case.
2. **Only one older note is reviewed.** If the user skipped a week, the last note's open tasks come in. Notes before it are not read. Older open tasks stay for the monthly migration.
3. **Stop at an empty older note.** Searching on would surprise the user with tasks from a much older day.
4. **Additive JSON.** Old fields stay. `source` is new, so `semver` stays minor.
5. **No config setting.** There is no limit on how far back the search goes. If this turns out to be wrong, a limit can come later.
