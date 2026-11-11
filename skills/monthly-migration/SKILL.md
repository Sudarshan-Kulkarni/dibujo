---
name: monthly-migration
description: Run the user's Bullet Journal monthly migration in their Obsidian vault. Walk through the tasks last month left open in the daily notes (migrate to today, schedule with or without a date, cancel, complete, or leave open), then the future log tasks that have no date or whose date has passed (bring into today, give a date, cancel, or leave), save those changes after the user confirms, then write a short monthly summary note with highlights, tasks done, tasks that kept moving, and themes and intentions, saved after the user confirms. Use when the user wants to do their monthly migration, review or summarize last month, clear out last month's open tasks, or when morning planning offers it at the start of a new month.
---

# Monthly migration

The user's paper notebook is their main journal. At the start of a month they look back at the month that just ended: what they left open, what is still waiting in the future log, and how the month went. Your job is to mirror their decisions in the vault and write a short summary of the month, using the `dibujo` CLI. dibujo records what the user decided. It never decides for them.

The ritual has five steps, always in this order: **leftover tasks**, **leftover future log entries**, **confirm and save the changes**, **summary**, then **confirm and save the summary**. Ask one thing at a time and keep it short. Nothing is written until the user confirms, and there are two confirmations: one for the changes to tasks and the future log, and one for the summary.

The note format, including bullet types, task states, migration links, the future log, and the monthly note, is defined in [references/vault-format.md](references/vault-format.md).

## Rules

- **Never edit vault files directly.** Read and write only through `dibujo` commands, always with `--json`, and read the JSON result.
- **Use the user's words.** Shorten, but don't rephrase into your own voice, add details, or comment on what they wrote.
- **Don't push.** Never recommend migrating, scheduling, bringing in, or dropping a task or an entry. Just ask.
- **The numbers come from dibujo.** Show the counts and the tasks that kept moving exactly as the CLI gives them. Never count, change, or reword them.
- **Never claim a save that didn't happen.** A change is saved only when its command returns `"ok": true`.
- **Let the user skip.** "skip", "nothing", "no", or "none" moves to the next step, or past the current question. Steps with nothing in them aren't shown at all.

## Steps

### 1. Find the CLI

Run `dibujo --version`. If the command isn't found, use `npx -y digi-bujo` in place of `dibujo` for every command below.

### 2. Read the month

The month is the one morning planning offered, the one the user named ("do my migration for September"), or the month before the current one.

```sh
dibujo month show [YYYY-MM] --json
```

Leave out `YYYY-MM` for the month before the current one.

- `"ok": true`: `data.leftovers` lists the tasks still open in the month's daily notes, oldest note first. Each has a `ref`, `date`, `text`, `signifiers`, `streak`, `flagged`, and `children` (the bullets nested under it, which move with it). `data.counts` and `data.moving` are for step 6. `data.notes` has every bullet of the month, for step 6.
- `data.skipped` isn't empty: tell the user which notes couldn't be read (their paths), and that they were left out.
- `data.summary.hasSummary` is `true`: say the month already has a summary, show `data.summary.path`, and do steps 3, 4, and 5 only. Don't draft another summary.
- `error.code` is `INVALID_DATE`: say the month isn't over yet, and stop.
- `error.code` is `CONFIG_MISSING` or `VAULT_NOT_FOUND`: tell the user to run `dibujo init` (show `error.hint`), and stop.
- Any other error: show `error.message` and `error.hint`, and stop.

Keep the `ref` of every task and child. You need them in step 5.

### 3. Leftover tasks

If `data.leftovers` is empty, say nothing and go to step 4.

Go through `data.leftovers` **one at a time**, oldest first. Show the task with its date and its children in Bullet Journal symbols (see step 5), then ask what the user did with it on paper:

| User says | Choice | Command in step 5 |
| --- | --- | --- |
| "migrate", "move", ">", "today" | Migrate to today | `dibujo task migrate <ref> --json` |
| "schedule", "<", "on Friday", "next month" | Schedule. If they gave a date, work out `YYYY-MM-DD`. If they didn't, ask once: "Is there a date for it, or just the future log?" | `dibujo task schedule <ref> <YYYY-MM-DD> --json` with a date, `dibujo task schedule <ref> --json` without |
| "drop", "cancel", "not doing it" | Cancel | `dibujo task set <ref> cancelled --json` |
| "done", "did it", "finished" | Complete | `dibujo task set <ref> completed --json` |
| "leave", "skip", "not sure" | Leave open | none |

- A scheduled date must be **after today**. If the user gives today or a past date, ask again, and suggest migrating instead if they meant today.
- **A "no" to the date question is a valid answer.** Schedule the task without a date. It goes into the future log undated. Don't ask again.
- **Scheduling also writes the future log.** `dibujo task schedule` adds the task to the future log as well. Don't ask the user about the future log separately.
- **Flagged tasks.** If `flagged` is `true`, mention it before asking, in a neutral way: "You've migrated this one {streak} days in a row. Keep it, or let it go?" Then take their answer as one of the choices above. Don't recommend either.
- **Children.** When a task is migrated, everything in its `children` moves with it, so don't ask about them. When a task is *not* migrated, ask about each open task in its `children` (those with `"type": "task"` and `"state": "open"`), one at a time, the same way. Events and notes in `children` need no answer.
- **Leaving a task open.** The first time the user leaves one, say once, neutrally: "It stays open in {date}'s note, and won't come up in a ritual again." Don't say it again for the next ones, and don't suggest a different choice.
- **Many tasks.** When there are many, tell the user once that they can answer for all the rest at once. "Cancel the rest" or "leave the rest" applies to every remaining task, children included.
- If the user says "skip" for the whole step, leave every remaining task open.

### 4. Leftover future log entries

```sh
dibujo future due --json
```

- `"ok": true`: the leftovers are the tasks in `data.entries` with `daysOverdue` above 0, and the tasks in `data.waiting` that have **no** `date`. Ignore everything else: entries due today come up in morning planning, and tasks dated after today are not waiting yet. Each leftover has a `ref`, `text`, and `signifiers`.
- No leftovers: say nothing and go to step 5.
- Any error: show `error.message` and `error.hint`, tell the user the future log wasn't checked, and go on to step 5.

Go through the leftovers **one at a time**. Show the text, and its date when it has one. When `daysOverdue` is above 0, say so in a neutral way ("This was due 2 days ago."). Don't recommend an answer. Then ask what to do:

| User says | Choice | Command in step 5 |
| --- | --- | --- |
| "bring it in", "today", ">" | Bring into today | `dibujo future migrate <ref> --json` |
| "push it", "later", "<", a date | Give it a date. Ask for the date if they didn't give one, and work out `YYYY-MM-DD`. It must be **after today**. | `dibujo future reschedule <ref> <YYYY-MM-DD> --json` |
| "drop", "cancel" | Cancel | `dibujo future cancel <ref> --json` |
| "leave", "skip", "not yet" | Leave | none |

- If the user gives today or a past date, ask again, and suggest bringing it in instead if they meant today.
- **Leaving an entry changes nothing.** An undated entry that is left stays in the future log as it is.
- "Cancel the rest" or "leave the rest" applies to every remaining leftover.
- If the user says "skip" for the whole step, leave every remaining entry as it is.

Keep the `ref` of every entry. You need them in step 5.

### 5. Confirm and save the changes

If nothing was changed in steps 3 and 4, say so in one line and go to step 6.

Show the changes from steps 3 and 4 together, in Bullet Journal symbols, grouped by the date of the note, then the future log:

```
2026-10-03
   > call the bank          → today
     > find card number     → today
   < renew passport         → 2026-12-01
   < call mum               → future log
   ~ old plan               (cancelled)
   × send invoice           (done)
   • water plants           (left open)

Future log
   > learn Rust             → today
   < file taxes             → 2026-12-15
   ~ gym trial              (cancelled)
   • buy gift               (left)
```

Symbols: `•` open task, `×` completed, `>` migrated or brought in, `<` scheduled or given a date, `~` cancelled. In the margin: `*` priority, `!` inspiration.

Ask the user to confirm or edit. Apply any edits and show the changes again if anything changed. **Don't save until the user confirms.**

Then run the commands in this order, one at a time, reading each JSON result:

1. `dibujo task set` and `dibujo task schedule <ref> [YYYY-MM-DD]`, for each task the user completed, cancelled, or scheduled.
2. `dibujo task migrate <ref> --json`, for each migrated task. Run it for the parent only. Its children move with it.
3. The future log entries: `dibujo future cancel`, then `dibujo future reschedule`, then `dibujo future migrate <ref> --json`, for each entry the user chose that for.

If a command fails:

| `error.code` | What to do |
| --- | --- |
| `NOTE_CHANGED` | The note was edited while saving. Run the **same command again once**, with the same ref. Migrating and rescheduling are safe to rerun: they finish what's missing and never duplicate. |
| `TASK_NOT_FOUND` | The note changed since step 2 or step 4. Run `dibujo month show [YYYY-MM] --json` again (for a future log entry, `dibujo future due --json`), find the same task or entry by its text, and retry once with its new `ref`. If you can't find it, report it as not saved. |
| Anything else | Don't retry. Note `error.message` and `error.hint` for the report, and carry on with the next command. |

Report briefly what was saved and what wasn't, item by item:

- `task set`: `data.status` is `updated` (saved) or `unchanged` (already that way).
- `task schedule`: `data.status` is `updated` or `unchanged` for the daily task, and `data.future.action` is `added`, `rescheduled`, or `unchanged` for the future log. Both count as saved.
- `task migrate`: `data.status` is `migrated` (saved, `data.copied` bullets added to today) or `unchanged` (already migrated).
- `future migrate`: `data.status` is `migrated` (saved, added to `data.target.date`) or `unchanged` (already brought in).
- `future reschedule`: `data.status` is `rescheduled` (saved) or `unchanged` (already had that date).
- `future cancel`: `data.status` is `updated` (saved) or `unchanged` (already cancelled).

For anything that failed, say clearly that it was **not saved**, and show `error.message` and `error.hint`.

### 6. Summary

Skip this step if the month already has a summary (step 2), or if the user says to skip it. If it is skipped, tell the user the month will be offered again tomorrow in morning planning.

Read the month again, so the counts include the changes just saved:

```sh
dibujo month show [YYYY-MM] --json
```

Draft three lists from `data.notes`, using the user's words:

- **Highlights:** up to about 5 short bullets from the month's events, notes, and completed tasks. No added detail and no comment.
- **Themes:** up to about 3 short bullets, drawn only from what is in the notes. No advice and no judgement.
- **Intentions:** don't draft these. Ask once: **"Any intentions for {next month name}?"** and use the user's words. "None" is an answer.

Each item is one short line. Don't put `#priority` or `#inspiration` in the text, don't start it with `[ ]`, and don't put `⏳`, `📅`, `^id`, or `[[links]]` in it.

### 7. Confirm and save the summary

Show the whole summary as it will be written, with the four sections in this order:

```
# October 2026 summary

Highlights
- moved into the new flat

Tasks done
23

Tasks that kept moving
- call the bank (moved 5 times)

Themes and intentions
Themes
- settling into the new flat
Intentions
- go to bed by 11
```

**Tasks done** is `data.counts.completed` and **Tasks that kept moving** is `data.moving` (`text` and `moves`), exactly as the CLI gave them. If `data.moving` is empty, say none moved `data.flagAfterDays` or more times. Say that a section with nothing in it is written with a short line saying so.

Ask the user to confirm or edit. Apply any edits and show the summary again if anything changed. **Don't save until the user confirms.**

Save with a **quoted heredoc** (`<<'DIBUJO_EOF'`, with the quotes), so quotes, `$`, and backticks in the user's text reach dibujo unchanged. Don't send the counts: dibujo computes them itself.

```sh
dibujo month summary [YYYY-MM] --json <<'DIBUJO_EOF'
{
  "highlights": ["moved into the new flat"],
  "themes": ["settling into the new flat"],
  "intentions": ["go to bed by 11"]
}
DIBUJO_EOF
```

The JSON must not contain a line that is exactly `DIBUJO_EOF`.

- `data.status` is `created` or `updated`: saved to `data.path`. `unchanged`: the same summary was already there.
- `error.code` is `SUMMARY_EXISTS`: a summary was written in the meantime. Say that nothing was changed, and that the user can edit the note by hand in Obsidian.
- `error.code` is `NOTE_CHANGED`: run the **same command again once**.
- `error.code` is `INVALID_INPUT`: your JSON was wrong. Fix it using `error.message` and retry. Don't show the raw JSON unless the user asks.
- Anything else: don't retry. Say the summary was **not saved**, and show `error.message` and `error.hint`.

Finish by saying exactly which changes were saved and which were not.
