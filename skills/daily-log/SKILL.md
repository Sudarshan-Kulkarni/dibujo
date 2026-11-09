---
name: daily-log
description: Log the user's thoughts, tasks, and events for a day as short Bullet Journal bullets in their Obsidian vault, using the dibujo CLI. Use when the user wants to log, jot down, capture, or brain-dump what's on their mind, what they did, or what they need to do, for today or another day.
---

# Daily log

The user writes freely, in their own words. Your job is to turn that into short Bullet Journal bullets, check them with the user, and save them to the day's note with the `dibujo` CLI. The user's paper notebook is their main journal. This log is a searchable companion to it.

The note format, including the bullet types, signifiers, and capture JSON schema, is defined in [references/vault-format.md](references/vault-format.md). Read it if you need detail beyond these steps.

## Rules

- **Never edit vault files directly.** Read and write only through `dibujo` commands.
- **Use the user's words.** Shorten, but don't rephrase into your own voice, add details, or comment on what they wrote.
- **Never claim a save that didn't happen.** Report success only when `dibujo` returns `"ok": true`.
- Always pass `--json` and read the JSON result. Don't parse the human-readable output.

## Steps

### 1. Find the CLI

Run `dibujo --version`. If the command isn't found, use `npx -y digi-bujo` in place of `dibujo` for every command below.

### 2. Pick the day and read it

The default is the current journal day. dibujo works it out, including the user's day-start hour, so don't pass `--date` for "today".

If the user's text clearly refers to a different day ("yesterday I...", "on Friday..."), work out the date, **confirm it with the user**, then use `--date YYYY-MM-DD` in this step and in step 5.

If the text covers **more than one day**, split it: make one capture per day, and give each capture only the part of the raw text about that day. Read each day with `log show`, show all the proposals together in step 4, and save each capture separately in step 5.

```sh
dibujo log show --json
```

- `"ok": true`: `data.bullets` lists what's already logged. `data.exists` is `false` if the day has no note yet.
- `error.code` is `CONFIG_MISSING` or `VAULT_NOT_FOUND`: tell the user to run `dibujo init` (show them `error.hint`), and stop.
- Any other error: show `error.message` and `error.hint`, and stop.

### 3. Turn the text into bullets

Split the user's text into separate items and classify each one:

| Type | Use for | Examples |
| --- | --- | --- |
| `task` | Something to do | "need to call the bank" → `call the bank` |
| `event` | Something that happens at a time or date, or happened | "dentist at 3" → `dentist at 3pm` |
| `note` | A thought, observation, feeling, or idea | "slept badly again" → `slept badly again` |

- **Keep bullets short.** Aim for a few words, like the user would write in a notebook. Remove filler ("ok so", "I think I need to"), but keep their wording.
- **Set the task state** only when the text says so. Leave it out for an open task. Use `"state": "completed"` for things the user says are done ("already sent the invoice"). Don't use `migrated`, `scheduled`, or `cancelled` here.
- **Signifiers:** add `"priority"` only when the user marks something as important ("the big one", "most important", "must"). Add `"inspiration"` only for ideas the user is excited about or explicitly calls an idea. If in doubt, leave them out.
- **Nesting:** use `"depth": 1` for a sub-item that clearly belongs to the bullet above it (for example, a task that follows from an idea). Most bullets are depth 0.
- **Skip duplicates:** leave out anything that's already in `data.bullets` from step 2, and tell the user you skipped it.
- Don't put `#priority` or `#inspiration` in the text, and don't start the text with `[ ]`. Use the fields instead.

### 4. Show the proposal and wait

Show the bullets with Bullet Journal symbols, with signifiers in the margin:

```
*  • call the bank
   × send invoice to Ana
   ○ dentist at 3pm
   – slept badly again
!  – weekly review on sunday evenings
     • block 30 min in calendar
```

Symbols: `•` open task, `×` completed task, `○` event, `–` note. In the margin: `*` priority, `!` inspiration.

Ask the user to confirm or edit. Apply any edits and show the result again if anything changed. **Don't save until the user confirms.**

### 5. Save

Build the capture JSON. `raw` is the user's original text for that day, exactly as they wrote it. Pass the JSON on stdin with a **quoted heredoc** (`<<'DIBUJO_EOF'`, with the quotes), so quotes, `$`, and backticks in the user's text reach dibujo unchanged:

```sh
dibujo log add --json <<'DIBUJO_EOF'
{
  "raw": "ok so today I need to call the bank, that's the big one. already sent the invoice to Ana. dentist at 3.",
  "bullets": [
    { "type": "task", "text": "call the bank", "signifiers": ["priority"] },
    { "type": "task", "text": "send invoice to Ana", "state": "completed" },
    { "type": "event", "text": "dentist at 3pm" }
  ]
}
DIBUJO_EOF
```

Add `--date YYYY-MM-DD` if you confirmed a different day in step 2. The JSON must not contain a line that is exactly `DIBUJO_EOF`.

### 6. Report the result

| Result | What to tell the user |
| --- | --- |
| `"ok": true`, `data.status` is `created` or `updated` | Saved: the number of bullets (`data.added`) and the note path (`data.path`). |
| `"ok": true`, `data.status` is `unchanged` | This capture was already logged, so nothing changed. |
| `error.code` is `NOTE_CHANGED` | The note was edited while saving. Run step 2 again, then repeat step 5 **once**. If it fails again, tell the user. |
| `error.code` is `INVALID_INPUT` | Your JSON was wrong. Fix it using `error.message` and retry. Don't show the user the raw JSON unless they ask. |
| Any other error | Show `error.message` and `error.hint`. Say clearly that nothing was saved. |
