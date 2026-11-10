---
name: morning-planning
description: Run the user's Bullet Journal morning planning in their Obsidian vault. Walk through yesterday's open tasks one at a time (migrate, schedule, cancel, complete, or leave open) to mirror their paper notebook, then go through the scheduled tasks that have come due in the future log (bring in, push to a later date, cancel, or leave), then capture a morning brain-dump as bullets in today's note. Use when the user wants to plan their morning, start their day, do their morning ritual, migrate yesterday's tasks, or see which scheduled tasks are due.
---

# Morning planning

The user's paper notebook is their main journal. They've usually just done their morning migration on paper. Your job is to mirror it in the vault, check whether any scheduled tasks have come due in the future log, then capture what's on their mind, using the `dibujo` CLI. dibujo records what the user decided. It never decides for them.

The ritual has five steps, always in this order: **migration**, **due future log entries**, **brain-dump**, **priority**, then **confirm and save**. Ask one thing at a time and keep it short. Nothing is written until the user confirms the whole plan in step 7.

The note format, including bullet types, task states, migration links, the future log, and the capture JSON schema, is defined in [references/vault-format.md](references/vault-format.md).

## Rules

- **Never edit vault files directly.** Read and write only through `dibujo` commands, always with `--json`, and read the JSON result.
- **Use the user's words.** Shorten, but don't rephrase into your own voice, add details, or comment on what they wrote.
- **Don't push.** Never recommend migrating, scheduling, bringing in, or dropping a task or an entry. Just ask.
- **Never claim a save that didn't happen.** A change is saved only when its command returns `"ok": true`.
- **Let the user skip.** "skip", "nothing", "no", or "none" moves to the next step, or past the current question. Steps with nothing in them aren't shown at all.

## Steps

### 1. Find the CLI

Run `dibujo --version`. If the command isn't found, use `npx -y digi-bujo` in place of `dibujo` for every command below.

### 2. Review yesterday

```sh
dibujo task review --json
```

- `"ok": true`: `data.tasks` lists yesterday's open tasks. Each has a `ref`, `text`, `signifiers`, `streak`, `since`, `flagged`, and `children` (the bullets nested under it, which move with it).
- `data.tasks` is empty: say so in one line ("Nothing open from yesterday.") and go to step 4.
- `error.code` is `CONFIG_MISSING` or `VAULT_NOT_FOUND`: tell the user to run `dibujo init` (show `error.hint`), and stop.
- Any other error: show `error.message` and `error.hint`, and stop.

Keep the `ref` of every task and child. You need them in step 8.

### 3. Migration

Go through `data.tasks` **one at a time**. Show the task and its children in Bullet Journal symbols (see step 7), then ask what the user did with it on paper:

| User says | Choice | Command in step 8 |
| --- | --- | --- |
| "migrate", "move", ">", "today" | Migrate to today | `dibujo task migrate <ref> --json` |
| "schedule", "<", "on Friday", "next week" | Schedule. Ask for the date if they didn't give one, and work out `YYYY-MM-DD`. | `dibujo task schedule <ref> <YYYY-MM-DD> --json` |
| "drop", "cancel", "not doing it" | Cancel | `dibujo task set <ref> cancelled --json` |
| "done", "did it", "finished" | Complete | `dibujo task set <ref> completed --json` |
| "leave", "skip", "not sure" | Leave open | none |

- A scheduled date must be after yesterday. If the user gives today or a past date, ask again, and suggest migrating instead if they meant today.
- **Scheduling also writes the future log.** `dibujo task schedule` adds the task to the future log as well, so it comes back in step 4 when its date arrives. Don't ask the user about the future log separately.
- **Flagged tasks.** If `flagged` is `true`, mention it before asking, in a neutral way: "You've migrated this one {streak} days in a row, since {since}. Keep it, or let it go?" Then take their answer as one of the choices above. Don't recommend either.
- **Children.** When a task is migrated, everything in its `children` moves with it, so don't ask about them. When a task is *not* migrated, ask about each open task in its `children` (those with `"type": "task"` and `"state": "open"`), one at a time, the same way. Events and notes in `children` need no answer.
- If the user says "skip" for the whole step ("skip migration"), leave every remaining task open.

### 4. Due future log entries

```sh
dibujo future due --json
```

- `"ok": true`: `data.entries` lists the scheduled tasks that have come due. Each has a `ref`, `text`, `signifiers`, `scheduled` (the date), `daysOverdue`, and `scheduledFrom`.
- `data.entries` is empty: say nothing and go to step 5.
- Any error: show `error.message` and `error.hint`, tell the user the future log wasn't checked, and go on to step 5. If a note has an unsupported version (`NOTE_VERSION_UNSUPPORTED`), the hint says how to fix it.

Go through the entries **one at a time**. Show the text and its date. When `daysOverdue` is above 0, say so in a neutral way ("This was due 2 days ago."). Don't recommend an answer. Then ask what to do:

| User says | Choice | Command in step 8 |
| --- | --- | --- |
| "bring it in", "today", ">" | Bring into today | `dibujo future migrate <ref> --json` |
| "push it", "later", "<", a date | Push to a later date. Ask for the date if they didn't give one, and work out `YYYY-MM-DD`. It must be after today. | `dibujo future reschedule <ref> <YYYY-MM-DD> --json` |
| "drop", "cancel" | Cancel | `dibujo future cancel <ref> --json` |
| "leave", "skip", "not yet" | Leave for now | none. It's listed again tomorrow. |

- If the user gives today or a past date to push to, ask again, and suggest bringing it in instead if they meant today.
- **Leaving an entry changes nothing.** It stays in the future log and comes up again the next morning.
- If the user says "skip" for the whole step ("skip the future log"), leave every remaining entry as it is.

Keep the `ref` of every entry. You need them in step 8.

### 5. Brain-dump

Ask once: **"What's on your mind this morning?"** If they say "nothing" or "skip", go to step 6.

Turn the answer into bullets:

| Type | Use for | Examples |
| --- | --- | --- |
| `task` | Something to do | "need to call the bank" → `call the bank` |
| `event` | Something that happens at a time or date, or happened | "dentist at 3" → `dentist at 3pm` |
| `note` | A thought, observation, feeling, or idea | "slept badly again" → `slept badly again` |

- **Keep bullets short**, a few words, like the user would write in a notebook. Remove filler ("ok so", "I think I need to"), but keep their wording.
- **Task state:** only set `"state": "completed"` for things the user says are already done. Otherwise leave it out.
- **Signifiers:** add `"inspiration"` only for ideas the user is excited about or calls an idea. Priority is handled in step 6, so only add `"priority"` here if the user explicitly marks something as most important.
- **Nesting:** use `"depth": 1` for a sub-item that clearly belongs to the bullet above it. Most bullets are depth 0.
- **Don't ask about mood, sleep, gratitude, or events.** If the user mentions them, they become bullets like anything else.
- **Skip duplicates:** before step 7, run `dibujo log show --json` for today and leave out anything already in `data.bullets`, already being migrated, or already being brought in from the future log. Tell the user what you skipped.
- Don't put `#priority` or `#inspiration` in the text, don't start the text with `[ ]`, and don't put `⏳`, `^id`, or `[[links]]` at the end. Use the fields instead.

### 6. Priority

Ask once: **"Anything that matters most today?"** If they say "no" or "skip", go to step 7.

Add `priority` only to the bullets the user names:

- a brain-dump bullet: add `"priority"` to its `signifiers`;
- a task being migrated: add `--priority` to its `task migrate` command;
- an entry being brought in from the future log: add `--priority` to its `future migrate` command.

### 7. Confirm

Show the whole plan in one message: yesterday's changes first, then the future log, then today's new bullets:

```
Yesterday (2026-11-09)
   > call the bank          → today
     > find card number     → today
   < renew passport         → 2026-12-01
   ~ old plan               (cancelled)
   × send invoice           (done)
   • water plants           (left open)

Future log
*  > book flights           → today
   < file taxes             → 2026-12-15
   ~ gym trial              (cancelled)
   • buy gift               (left for now)

Today (2026-11-10)
*  • call the bank          (migrated)
     • find card number     (migrated)
   ○ dentist at 3pm
   – slept badly
!  – weekly review on sundays
```

Symbols: `•` open task, `×` completed, `>` migrated or brought in, `<` scheduled or pushed, `~` cancelled, `○` event, `–` note. In the margin: `*` priority, `!` inspiration.

Ask the user to confirm or edit. Apply any edits and show the plan again if anything changed. **Don't save until the user confirms.** If every step was skipped or left as it was, say there's nothing to save, and stop.

### 8. Save

Run the commands in this order, one at a time, reading each JSON result:

1. `dibujo task set` and `dibujo task schedule`, for each task the user completed, cancelled, or scheduled.
2. `dibujo task migrate <ref> [--priority] --json`, for each migrated task. Run it for the parent only. Its children move with it.
3. The future log entries: `dibujo future cancel`, then `dibujo future reschedule`, then `dibujo future migrate <ref> [--priority] --json`, for each entry the user chose that for.
4. The brain-dump, if there is one. `raw` is the user's brain-dump text exactly as they wrote it. Pass the JSON on stdin with a **quoted heredoc** (`<<'DIBUJO_EOF'`, with the quotes), so quotes, `$`, and backticks in the user's text reach dibujo unchanged:

```sh
dibujo log add --json <<'DIBUJO_EOF'
{
  "raw": "dentist at 3. slept badly. idea: weekly review on sundays",
  "bullets": [
    { "type": "event", "text": "dentist at 3pm" },
    { "type": "note", "text": "slept badly" },
    { "type": "note", "text": "weekly review on sundays", "signifiers": ["inspiration"] }
  ]
}
DIBUJO_EOF
```

The JSON must not contain a line that is exactly `DIBUJO_EOF`.

If a command fails:

| `error.code` | What to do |
| --- | --- |
| `NOTE_CHANGED` | The note was edited while saving. Run the **same command again once**, with the same ref. Migrating and rescheduling are safe to rerun: they finish what's missing and never duplicate. |
| `TASK_NOT_FOUND` | The note changed since step 2 or step 4. Run `dibujo task review --json` again (for a future log entry, `dibujo future due --json`), find the same task or entry by its text, and retry once with its new `ref`. If you can't find it, report it as not saved. |
| `INVALID_INPUT` | Your capture JSON was wrong. Fix it using `error.message` and retry. Don't show the user the raw JSON unless they ask. |
| Anything else | Don't retry. Note `error.message` and `error.hint` for the report, and carry on with the next command. |

### 9. Report

Tell the user, briefly, what was saved and what wasn't, task by task:

- `task set`: `data.status` is `updated` (saved) or `unchanged` (already that way).
- `task schedule`: `data.status` is `updated` or `unchanged` for the daily task, and `data.future.action` is `added`, `rescheduled`, or `unchanged` for the future log. Both count as saved.
- `task migrate`: `data.status` is `migrated` (saved, `data.copied` bullets added to today) or `unchanged` (already migrated).
- `future migrate`: `data.status` is `migrated` (saved, added to `data.target.date`) or `unchanged` (already brought in).
- `future reschedule`: `data.status` is `rescheduled` (saved, now waiting for `data.to.date`) or `unchanged` (already moved).
- `future cancel`: `data.status` is `updated` (saved) or `unchanged` (already cancelled).
- `log add`: `data.status` is `created` or `updated` (saved `data.added` bullets to `data.path`) or `unchanged` (already logged).

Say which due entries were left for now, and that they'll come up again tomorrow. For anything that failed, say clearly that it was **not saved**, and show `error.message` and `error.hint`.
