---
name: future-log
description: Add tasks, events, and notes to the user's Bullet Journal future log in their Obsidian vault, with a date when they have one, and read or change what is in it, using the dibujo CLI. Use when the user wants to put something on their future log or save something for later ("put the dentist on Dec 12 on my future log", "add learn Rust to my future log", "remind me in March"), asks what is in their future log, or wants to give a date to, bring into today, or cancel a future log entry.
---

# Future log

The future log is where the user keeps things that can't be done now. An entry can have a date, and then it comes back in morning planning when the date arrives. An entry without a date waits until the user looks at the list. Your job is to turn what the user says into entries, check them with the user, and save them with the `dibujo` CLI.

The note format, including the future log, its dates, and the `future add` JSON schema, is defined in [references/vault-format.md](references/vault-format.md). Read it if you need detail beyond these steps.

## Rules

- **Never edit vault files directly.** The future log is changed only through `dibujo` commands, never by editing `Future.md` or anything under `Future/`.
- **Use the user's words.** Shorten, but don't pad, rephrase into your own voice, add details, or comment on what they wrote.
- **Ask for a date only when the user hints at one** ("on Dec 12", "next Friday", "in March"). Otherwise the entry has no date, and you don't ask.
- **Never claim a save that didn't happen.** Report success only when `dibujo` returns `"ok": true`.
- Always pass `--json` and read the JSON result. Don't parse the human-readable output.

## Steps

### 1. Find the CLI

Run `dibujo --version`. If the command isn't found, use `npx -y digi-bujo` in place of `dibujo` for every command below.

### 2. Turn the text into entries

Split the user's text into separate items and classify each one:

| Type | Use for | Example |
| --- | --- | --- |
| `task` | Something to do | "learn Rust" → `learn Rust` |
| `event` | Something that happens on a date | "dentist on Dec 12 at 3" → `dentist at 3pm`, dated 2026-12-12 |
| `note` | A thought or idea to keep | "check out the zine fair in spring" → `check out the zine fair in spring` |

- **Keep entries short**, a few words, like the user would write in a notebook. Remove filler ("can you put", "I should"), but keep their wording.
- **Signifiers:** add `"priority"` only when the user marks something as important, and `"inspiration"` only for ideas they call an idea or are excited about. If in doubt, leave them out.
- **Don't put** `#priority`, `#inspiration`, `⏳`, `📅`, `^id`, or a `[[link]]` in the text, and don't start it with `[ ]`. Use the fields instead.
- **A note can't have a date.** Something that has a date is a task or an event, not a note.

### 3. Work out the dates

Give a task or an event a `date` (`YYYY-MM-DD`) only when the user hints at one.

- Work out the full date from today's date. A date must be **today or later**. If the date the user names has already passed, ask them which date they mean.
- **A month only** ("in March"): ask for a day. If the user doesn't have one, add the entry **without a date**, and don't write the month in the text.
- If a date is ambiguous ("next Friday" on a Friday), ask.

### 4. Show the proposal and wait

Show the entries with Bullet Journal symbols, with signifiers in the margin and dates at the end:

```
   ○ dentist at 3pm           📅 2026-12-12
   • learn Rust
*  • book flights             ⏳ 2026-12-20
   – check out the zine fair in spring
```

Symbols: `•` task, `○` event, `–` note. In the margin: `*` priority, `!` inspiration. `⏳` marks a task's date, and `📅` an event's.

Ask the user to confirm or edit. Apply any edits and show the result again if anything changed. **Don't save until the user confirms.**

### 5. Save

Pass the JSON on stdin with a **quoted heredoc** (`<<'DIBUJO_EOF'`, with the quotes), so quotes, `$`, and backticks in the user's text reach dibujo unchanged:

```sh
dibujo future add --json <<'DIBUJO_EOF'
{
  "entries": [
    { "type": "event", "text": "dentist at 3pm", "date": "2026-12-12" },
    { "type": "task", "text": "learn Rust" },
    { "type": "task", "text": "book flights", "date": "2026-12-20", "signifiers": ["priority"] },
    { "type": "note", "text": "check out the zine fair in spring" }
  ]
}
DIBUJO_EOF
```

The JSON must not contain a line that is exactly `DIBUJO_EOF`. If any entry is invalid, dibujo adds none of them.

### 6. Report the result

| Result | What to tell the user |
| --- | --- |
| `"ok": true`, `data.status` is `created` or `updated` | Saved: the entries in `data.added`. If `data.skipped` is above 0, say that many were already in the future log. Dated tasks come back in morning planning when their date arrives. |
| `"ok": true`, `data.status` is `unchanged` | Everything was already in the future log (`data.skipped`), so nothing changed. |
| `error.code` is `CONFIG_MISSING` or `VAULT_NOT_FOUND` | Tell the user to run `dibujo init` (show `error.hint`). |
| `error.code` is `INVALID_DATE` | A date was earlier than today or not a real date. Ask the user for another date, or add the entry without one. |
| `error.code` is `INVALID_INPUT` | Your JSON was wrong. Fix it using `error.message` and retry. Don't show the user the raw JSON unless they ask. |
| `error.code` is `NOTE_CHANGED` | The note was edited while saving. Run the **same command again once**. It never adds an entry twice. If it fails again, tell the user. |
| `error.code` is `NOTE_VERSION_UNSUPPORTED` | Show `error.message` and `error.hint`. Say clearly that nothing was saved. |
| Any other error | Show `error.message` and `error.hint`. Say clearly that nothing was saved. |

## Reading the future log

When the user asks what is in their future log:

```sh
dibujo future show --json
```

- `data.exists` is `false`: the future log is empty. Say so.
- Otherwise `data.entries` lists every entry in the order it is in the note. Each has a `ref`, `type`, `state` (tasks only), `text`, `signifiers`, and `date` if it has one. Show the entries that are still waiting (open tasks, events, and notes) with the symbols from step 4, dated ones with their date. Mention brought-in, cancelled, or completed tasks only if the user asks.
- `data.unrecognized` lists lines dibujo can't read as entries. They are kept as they are. Mention them if there are any.
- If `data.legacyNotes` isn't empty, tell the user that the old year notes (the paths in the list) have entries that aren't in the future log yet, and offer to copy them with `dibujo future import --json`. Run it only if they agree. Report `data.copied`, and list any `data.unreadable` lines, which were not copied. The old notes are never changed.

## Changing an entry

Find the entry in `data.entries` by its text and use its `ref`. If more than one entry matches, ask which one. Only tasks can be changed this way. For an event or a note (`NOT_A_TASK`), tell the user dibujo can't change it, and that they can edit the line in Obsidian.

| User says | Command |
| --- | --- |
| "give it a date", "move it to March 3", "push it" | `dibujo future reschedule <ref> <YYYY-MM-DD> --json`. The date must be **after today**. It sets the date, or changes it where it is. |
| "bring it into today", "do it today" | `dibujo future migrate <ref> --json`, with `--priority` if the user says it matters most today. |
| "drop it", "cancel it" | `dibujo future cancel <ref> --json` |

Report from the result. `data.status` is `rescheduled`, `migrated`, or `updated`, or `unchanged` when it was already that way. An error with `TASK_NOT_FOUND` means the note changed: run `dibujo future show --json` again, find the entry by its text, and retry once. `TASK_NOT_OPEN` means the entry was already brought in, cancelled, or completed. Say that nothing was changed.
