# dibujo vault format (v1)

This document defines how dibujo stores Bullet Journal entries in an Obsidian vault. The `dibujo` CLI reads and writes notes in this format, and agent skills use it to turn your words into bullets. You can also edit notes by hand in Obsidian, as long as you follow these rules.

## Where notes live

Daily notes are stored at:

```
<vault>/<folder>/Daily/YYYY-MM-DD.md
```

- `<vault>` is the vault path you gave `dibujo init`.
- `<folder>` is the dibujo folder inside the vault. It defaults to `Bujo`.
- `YYYY-MM-DD` is the **journal date**. It's the local calendar date, except that entries before your configured day-start hour count as the previous day. With a day-start hour of 4, an entry at 01:30 on the 10th goes in the note for the 9th.

The file name matches the default format of Obsidian's Daily Notes plugin, so you can point that plugin at `<folder>/Daily` if you like.

The [future log](#future-log) is stored next to the daily notes, one note per year, at `<vault>/<folder>/Future/YYYY.md`.

## Example

```markdown
---
dibujo: 1
type: daily
date: 2026-11-09
---

## Log

- [ ] call the bank about the card #priority
- [x] send invoice to Ana
- [ ] renew passport [[Bujo/Daily/2026-11-08#^k3f9a1|from 2026-11-08]]
- [<] book flights ⏳ 2026-11-20
* dentist at 3pm
- sleep was bad, too much screen time before bed
- weekly review on sunday evenings #inspiration
	- [ ] block 30 min in calendar

## Captures

> [!capture]- 08:42 · 3f9a1b2c
> ok so today I need to call the bank about the card, that's the
> big one. sent the invoice to Ana already. dentist at 3. slept
> badly again, too much phone before bed.

> [!capture]- 21:10 · 9c04e7d1
> thinking I should do a weekly review on sunday evenings, need
> to block time for it
```

## Frontmatter

dibujo writes this frontmatter when it creates a note:

| Field | Meaning |
| --- | --- |
| `dibujo` | Format version. This document describes version `1`. |
| `type` | Always `daily` for daily notes. (Future log notes use `future`.) |
| `date` | The journal date, `YYYY-MM-DD`. |

- dibujo never edits frontmatter in an existing note. If a note has no frontmatter, or frontmatter without a `dibujo` field (for example, a note created by the Daily Notes plugin), dibujo reads it as version 1 and leaves the frontmatter as it is.
- If `dibujo` is higher than the version your CLI supports, the CLI won't write to the note. Upgrade with `npm update -g digi-bujo`.
- You can add your own frontmatter fields. dibujo ignores them.

## Sections

A daily note has two sections that dibujo manages. Headings are matched without regard to case.

### `## Log`

Holds the bullets, one per line. The section runs from the `## Log` heading to the next `## ` heading.

### `## Captures`

Holds the original text of each capture, so nothing is lost if a bullet was parsed wrongly. Each capture is a collapsed callout:

```markdown
> [!capture]- 08:42 · 3f9a1b2c
> the raw text, exactly as given,
> one line per line
```

- The title is the time the capture was saved (`HH:mm`, local time) and its **capture id**, separated by `·`.
- The capture id is 8 hex characters computed from the capture's content. dibujo uses it to skip a capture that was already saved, so sending the same capture twice adds it once.
- Every line of raw text starts with `> `, so raw text can never create a heading or a bullet in the note.
- Callouts are separated by a blank line.

### Other sections

You can add any other sections (`## Gratitude`, `# Monday`, and so on) anywhere in the note. dibujo never changes them.

## Bullets

### Types and states

| Bullet | Markdown | Bullet Journal symbol |
| --- | --- | --- |
| Task, open | `- [ ] text` | • |
| Task, completed | `- [x] text` | × |
| Task, migrated | `- [>] text` | > |
| Task, scheduled | `- [<] text` | < |
| Task, cancelled | `- [-] text` | ~~•~~ (struck through) |
| Event | `* text` | ○ |
| Note | `- text` | – |

- Tasks are Obsidian checkboxes. The character inside the brackets is the state. `X` also means completed.
- Events use the `*` list marker. Notes use `-`.
- When reading, dibujo accepts any list marker (`-`, `*`, `+`) before a checkbox, so `* [ ] task` typed by hand is still a task. dibujo always writes tasks with `-`.
- A line in the Log that starts like a checkbox but uses another character (for example `- [?] text`) is not a bullet. See [Lines dibujo doesn't recognize](#lines-dibujo-doesnt-recognize).

Checkboxes with `>`, `<` and `-` are the usual "alternative checkbox" characters supported by themes such as Minimal and by the Tasks plugin. Without them, Obsidian still shows a checkbox and the line stays readable.

### Signifiers

Signifiers are Obsidian tags at the **end** of the line, after the text:

| Signifier | Tag | Bullet Journal symbol |
| --- | --- | --- |
| Priority | `#priority` | * |
| Inspiration | `#inspiration` | ! |

- A bullet can have both: `- [ ] start the zine #inspiration #priority`.
- Only tags at the end of the line count. `the #priority list is long` is a note with no signifier.
- Other tags (`#work`) are part of the text.

The literal Bullet Journal symbols are not used because they break Markdown: `- * text` makes a nested list, and `![` starts an image.

### Nesting

Indent a bullet one level to make it a child of the bullet above it. dibujo writes one tab per level. When reading, a tab counts as one level, and spaces count as one level per 4 (rounded up, so 2-space indents work too).

```markdown
- weekly review on sunday evenings
	- [ ] block 30 min in calendar
		- 6–6:30pm works best
```

dibujo writes at most 3 levels of nesting but reads any depth.

### Task fields

A bullet line can end with a few fields after its text. dibujo adds them when it migrates or schedules a task, and you can type them by hand:

| Field | Markdown | Meaning |
| --- | --- | --- |
| Origin link (daily) | `[[Bujo/Daily/2026-11-08#^k3f9a1\|from 2026-11-08]]` | This task was migrated from the task with block id `k3f9a1` in the note for 2026-11-08. Tasks only. |
| Origin link (future log) | `[[Bujo/Future/2026#^m4n5p6\|from future log 2026]]` | This task came from the entry with block id `m4n5p6` in the future log note for 2026. Tasks only. |
| Scheduled date | `⏳ 2026-11-20` | The date the task is scheduled for, in the [Tasks plugin](https://publish.obsidian.md/tasks/) format. Tasks only. |
| Block id | `^k3f9a1` | An Obsidian block id. dibujo adds one to a task when it migrates it, so the copy can link back. |

dibujo writes them in this order, after the text:

```markdown
- [<] call the bank [[Bujo/Daily/2026-11-08#^k3f9a1|from 2026-11-08]] #priority ⏳ 2026-11-20 ^p07c2e
```

- **The block id comes last**, because Obsidian only recognizes `^id` at the very end of a line.
- **The scheduled date comes after the tags**, where the Tasks plugin reads it.
- **The origin link uses the full path** to the note, so it opens the right note even if another note has the same name. Obsidian shows it as "from 2026-11-08" (or "from future log 2026"). Clicking it opens that note at the original task, and the original note lists the copy in its backlinks.
- **The two link forms differ only in their target.** The target of a daily link is a date (`Daily/2026-11-08`), and the target of a future link is a year (`Future/2026`). Both are read the same way, and both go in the same place in the field order.

When reading, dibujo accepts the fields **in any order** at the end of the line, so hand edits work too:

- An origin link can also be written with just the note's name, like `[[2026-11-08#^k3f9a1]]` or `[[2026#^m4n5p6]]`. Its alias, the part after `|`, is ignored.
- `⏳️` (with the emoji variation selector) works the same as `⏳`.
- A field in the middle of the text is part of the text. Only fields at the end of the line count.
- If the same field appears twice at the end, the one nearest the end counts, and the other stays in the text.
- Scheduled dates and origin links are only read on tasks. On an event or a note, they're part of the text.
- A link is an origin link only when its target and folder agree. A date target (`YYYY-MM-DD`) needs no folder or one ending in `Daily/`. A year target (`YYYY`) needs no folder or one ending in `Future/`. Any other link stays in the text. For example, `[[Books/2026#^abc]]` and `[[Bujo/Daily/2026#^abc]]` are not origin links.

A task without any of these fields is still a valid task.

### Lines dibujo doesn't recognize

Inside `## Log`:

- Blank lines are ignored.
- Any other line that isn't a valid bullet, such as a paragraph, a sub-heading, or `- [?] text`, is **kept exactly as it is**. `dibujo log show` reports it under `unrecognized` with its line number.
- dibujo never deletes or rewrites a line it doesn't recognize.

## Migration

Migrating a task moves it from one day to a later one, usually from yesterday to today. `dibujo task migrate` mirrors what you did in your notebook:

1. In the original note, the task becomes `- [>]` and gets a block id.
2. In the later note, a copy is added at the end of `## Log` as an open task, with an origin link back to the original.

```markdown
2026-11-09:  - [>] plan trip #priority ^r1a2b3
2026-11-10:  - [ ] plan trip [[Bujo/Daily/2026-11-09#^r1a2b3|from 2026-11-09]] #priority
```

What's nested under the task moves with it:

| Nested bullet | In the original note | In the later note |
| --- | --- | --- |
| Open task | Becomes `[>]` and gets a block id | Copied as an open task, with its own origin link |
| Event or note | Unchanged | Copied as it is |
| Completed, scheduled, cancelled, or already migrated task | Unchanged | Not copied, and neither is anything nested under it |

The copy keeps the task's text and signifiers. A copy that starts nested is moved to the top level, and nothing is nested more than 3 levels deep.

### Migration streaks

`dibujo task review` counts how many days in a row a task has been migrated. It follows origin links back one day at a time: each link to a `[>]` task in the previous day's note adds one. Because the link points at the block id, rewording the task doesn't break the streak.

The count stops, without an error, at the first:

- task with no origin link;
- link to a day other than the day before;
- link to the future log. A task that came back from the future log starts again at 0;
- note that's missing, or uses a format version this dibujo can't read;
- link whose block id can't be found, for example because the line was deleted.

A task is flagged when its streak reaches `migrationFlagDays` in your config (3 by default).

## Future log

In a paper Bullet Journal, a task that can't be done now goes into the future log, which you check as dates come up. dibujo keeps the future log as one note per year:

```
<vault>/<folder>/Future/YYYY.md
```

The file name is the year, and it decides which year a note covers. dibujo creates the note when the first task is scheduled for that year.

```markdown
---
dibujo: 1
type: future
year: 2026
---

## 2026-11 November

- [>] renew passport [[Bujo/Daily/2026-11-09#^k3f9a1|from 2026-11-09]] #priority ⏳ 2026-11-12 ^m4n5p6

## 2026-12 December

- [ ] book flights [[Bujo/Daily/2026-11-09#^q7r8s9|from 2026-11-09]] ⏳ 2026-12-20
- [<] file taxes [[Bujo/Daily/2026-11-02#^t1u2v3|from 2026-11-02]] ⏳ 2026-12-01 ^w4x5y6
- [ ] file taxes [[Bujo/Future/2026#^w4x5y6|from future log 2026]] ⏳ 2026-12-15
- [ ] send holiday cards
```

A new note has all 12 months, so you can type into any of them in Obsidian. The example leaves the other months out.

### Frontmatter

| Field | Meaning |
| --- | --- |
| `dibujo` | Format version. Still `1`. |
| `type` | Always `future`. |
| `year` | The year the note covers, `YYYY`. |

As with daily notes, dibujo never edits the frontmatter of an existing note. A future log note newer than the CLI supports is never written to.

### Months

- There is one `## YYYY-MM <Month name>` section per month, in calendar order, for example `## 2026-12 December`.
- A heading is recognized by the `YYYY-MM` at its start. The month name is for people. dibujo writes it in English, whatever your computer's language.
- If a month heading is missing, dibujo adds it in calendar order when it needs to write there.
- Text outside the month sections (a `# Notes` heading, a paragraph at the top) is never read or changed, and bullets outside the month sections aren't entries.

### Entries

An entry is a bullet under a month heading. The entries dibujo writes are tasks. They use the same line format as daily notes, with the same [fields in the same order](#task-fields): text, origin link, tags, `⏳` date, block id.

| State | Checkbox | Meaning in the future log |
| --- | --- | --- |
| Waiting | `[ ]` | Waiting for its date |
| Brought in | `[>]` | Brought into a daily note |
| Rescheduled | `[<]` | Moved to another date. A new waiting entry carries on. |
| Cancelled | `[-]` | Cancelled |
| Completed | `[x]` | Completed by hand. dibujo never sets this state. |

- **Dates.** An entry's `⏳` date decides when it is due. Its section is only for reading. If you move an entry to another month by hand, or change its date, dibujo goes by the date and leaves the line where it is.
- **Undated entries.** An entry without a `⏳` date, for example one you typed by hand, is valid and kept. It is never due.
- **Lines that aren't bullets.** Anything else under a month heading is kept exactly as it is, and `dibujo future show` reports it under `unrecognized`.

### Due entries

An entry is **due** when it is a task in state waiting (`[ ]`) with a `⏳` date that is today or earlier. `dibujo future due` looks in the note for today's year and in every earlier year's note, so an entry left waiting over New Year isn't lost.

A waiting entry stays waiting until it is brought in, rescheduled, or cancelled, so a due entry is listed again every day. Missing a day never makes it disappear.

### Scheduling and coming back

`dibujo task schedule` marks the daily task `[<]`, sets its `⏳` date and a block id, and adds a waiting entry to the future log, under the month of that date. When the entry is brought in with `dibujo future migrate`, the entry becomes `[>]` and a new open task is added to a daily note. The three lines link to each other:

```markdown
2026-11-09:   - [<] renew passport #priority ⏳ 2026-11-12 ^k3f9a1
Future 2026:  - [>] renew passport [[Bujo/Daily/2026-11-09#^k3f9a1|from 2026-11-09]] #priority ⏳ 2026-11-12 ^m4n5p6
2026-11-12:   - [ ] renew passport [[Bujo/Future/2026#^m4n5p6|from future log 2026]] #priority
```

- Only the task itself goes into the future log. Bullets nested under it stay in the daily note.
- `dibujo future reschedule` works the same way. The old entry becomes `[<]` and gets a block id, and a new waiting entry with the new date links back to it (the `file taxes` lines in the example above).
- A task that came back from the future log is a normal open task. Its link points at the future log and not at the day before, so its migration streak starts at 0.

In this version, dibujo adds entries only from scheduled daily tasks. Entries you type by hand work too, but they have no link back.

## How dibujo writes to a note

When you add a capture, dibujo:

1. Creates the note from the template if it doesn't exist.
2. Adds the new bullets after the last line of `## Log`.
3. Adds the capture callout at the end of `## Captures`.
4. Creates either section if it's missing. `## Log` goes before `## Captures`, and anything missing goes at the end of the note.

Adding a capture never changes or removes existing lines.

The `dibujo task` and `dibujo future` commands change one existing line at a time, and only in these ways:

- the character inside the checkbox (`[ ]`, `[x]`, `[>]`, `[<]`, `[-]`);
- the date of a `⏳` field, or a new `⏳` field;
- a new block id at the end of the line.

dibujo checks every such edit before writing. If an edit would change your words, signifiers, indentation, or origin link, or any other line, it refuses and writes nothing.

In a future log note, dibujo adds new entries after the last non-blank line of the month's section. If the month heading is missing, it adds the heading in calendar order. It never deletes or rewrites anything you wrote there.

Some commands write more than one note: `task schedule` (the daily note and the future log), `task migrate`, `future migrate`, and `future reschedule` to another year. dibujo reads and checks the format version of every note before it writes the first one, then writes them in a fixed order. If a run is interrupted between two writes, run the same command again. It finishes what is missing and never adds a second copy.

Every write is atomic: dibujo writes a hidden temp file (`.<name>.<pid>.tmp`) in the same folder and swaps it into place, so a crash can't leave a half-written note.

## Capture input

Skills send captures to `dibujo log add` as JSON on stdin:

```json
{
  "raw": "need to call the bank, that's the big one. dentist at 3.",
  "bullets": [
    { "type": "task", "text": "call the bank", "signifiers": ["priority"] },
    { "type": "event", "text": "dentist at 3pm" }
  ]
}
```

| Field | Rules |
| --- | --- |
| `raw` | Required. The user's original text. Must not be empty. |
| `bullets` | Required. At least one bullet. |
| `bullets[].type` | Required. `task`, `event`, or `note`. |
| `bullets[].text` | Required. One line, not empty. Must not start with a checkbox like `[ ]`, must not contain `#priority` or `#inspiration` (use `signifiers`), and must not contain `⏳` or end with a block id (`^abc`) or a block link (`[[note#^abc]]`). dibujo sets those fields itself. |
| `bullets[].state` | Tasks only. `open` (default), `completed`, `migrated`, `scheduled`, or `cancelled`. |
| `bullets[].signifiers` | Optional list of `priority` and `inspiration`. Defaults to none. |
| `bullets[].depth` | Optional nesting level from 0 to 3. Defaults to 0. The first bullet must be 0, and each bullet can be at most one level deeper than the one before it. |

Unknown fields are rejected.

## Warnings

### Markdown formatters can turn events into notes

Obsidian shows `*` and `-` list items as the same dot, so the event/note difference only exists in the raw text. Obsidian itself never changes list markers, but some tools do:

- **Prettier**, run on your vault.
- **Obsidian Linter**, with the "list marker style" rule turned on.

Either one can rewrite every `*` to `-`, which turns all your events into notes. If you use them, exclude `<folder>/Daily` or turn off list-marker rewriting.

### Editing while dibujo writes

Before swapping in its new version, dibujo re-reads the note. If the note changed since dibujo first read it, dibujo stops and reports `NOTE_CHANGED` instead of overwriting it. The agent then reads the note again and retries.

One small gap is left. If Obsidian saves the same note in the few milliseconds between that re-read and the swap, your edit can be lost. Closing the gap completely would need file locking, which Obsidian doesn't support. In practice, avoid typing in today's note at the exact moment the agent saves a capture.

### Renaming the dibujo folder breaks origin links

Origin links contain the folder path: `Bujo/Daily/...` in daily notes, and `Bujo/Future/...` in the future log. If you rename or move the folder outside Obsidian, both kinds of links stop resolving and migration streaks restart from zero. Renaming inside Obsidian, with "Automatically update internal links" turned on, updates the links for you. A folder name containing `[`, `]`, `|`, `#`, or `^` can't be used in a link, so `dibujo task migrate`, `dibujo task schedule`, and the `dibujo future` commands that write links refuse to run with one.

## Versioning

This is version 1 of the format. Task fields (origin links, scheduled dates, and block ids) were added within version 1, because they're optional and every older note is still valid. The future log was added within version 1 too. It is a new kind of note (`type: future`) in its own `Future/` folder, which no older CLI reads or writes. Daily notes only gain two optional things: the future form of the origin link, and a block id on a scheduled task. An older CLI that meets a future link keeps it as plain text, because its folder doesn't end in `Daily/`. If a future version changes the format (for example, a different event marker), it will raise the `dibujo` number, and the CLI will be able to recognize older notes and upgrade them.
