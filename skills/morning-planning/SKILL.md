---
name: morning-planning
description: Run the user's Bullet Journal morning planning in their Obsidian vault. Walk through yesterday's open tasks one at a time (migrate, schedule, cancel, complete, or leave open) to mirror their paper notebook, then capture a morning brain-dump as bullets in today's note. Use when the user wants to plan their morning, start their day, do their morning ritual, or migrate yesterday's tasks.
---

# Morning planning

The user's paper notebook is their main journal. They've usually just done their morning migration on paper. Your job is to mirror it in the vault, then capture what's on their mind, using the `dibujo` CLI. dibujo records what the user decided. It never decides for them.

The ritual has four steps, always in this order: **migration**, **brain-dump**, **priority**, then **confirm and save**. Ask one thing at a time and keep it short. Nothing is written until the user confirms the whole plan in step 6.

The note format, including bullet types, task states, migration links, and the capture JSON schema, is defined in [references/vault-format.md](references/vault-format.md).

## Rules

- **Never edit vault files directly.** Read and write only through `dibujo` commands, always with `--json`, and read the JSON result.
- **Use the user's words.** Shorten, but don't rephrase into your own voice, add details, or comment on what they wrote.
- **Don't push.** Never recommend migrating, scheduling, or dropping a task. Just ask.
- **Never claim a save that didn't happen.** A change is saved only when its command returns `"ok": true`.
- **Let the user skip.** "skip", "nothing", "no", or "none" moves to the next step. Steps with nothing in them aren't shown at all.

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

Keep the `ref` of every task and child. You need them in step 7.

### 3. Migration

Go through `data.tasks` **one at a time**. Show the task and its children in Bullet Journal symbols (see step 6), then ask what the user did with it on paper:

| User says | Choice | Command in step 7 |
| --- | --- | --- |
| "migrate", "move", ">", "today" | Migrate to today | `dibujo task migrate <ref> --json` |
| "schedule", "<", "on Friday", "next week" | Schedule. Ask for the date if they didn't give one, and work out `YYYY-MM-DD`. | `dibujo task schedule <ref> <YYYY-MM-DD> --json` |
| "drop", "cancel", "not doing it" | Cancel | `dibujo task set <ref> cancelled --json` |
| "done", "did it", "finished" | Complete | `dibujo task set <ref> completed --json` |
| "leave", "skip", "not sure" | Leave open | none |

- A scheduled date must be after yesterday. If the user gives today or a past date, ask again, and suggest migrating instead if they meant today.
- **Flagged tasks.** If `flagged` is `true`, mention it before asking, in a neutral way: "You've migrated this one {streak} days in a row, since {since}. Keep it, or let it go?" Then take their answer as one of the choices above. Don't recommend either.
- **Children.** When a task is migrated, everything in its `children` moves with it, so don't ask about them. When a task is *not* migrated, ask about each open task in its `children` (those with `"type": "task"` and `"state": "open"`), one at a time, the same way. Events and notes in `children` need no answer.
- If the user says "skip" for the whole step ("skip migration"), leave every remaining task open.

### 4. Brain-dump

Ask once: **"What's on your mind this morning?"** If they say "nothing" or "skip", go to step 5.

Turn the answer into bullets:

| Type | Use for | Examples |
| --- | --- | --- |
| `task` | Something to do | "need to call the bank" → `call the bank` |
| `event` | Something that happens at a time or date, or happened | "dentist at 3" → `dentist at 3pm` |
| `note` | A thought, observation, feeling, or idea | "slept badly again" → `slept badly again` |

- **Keep bullets short**, a few words, like the user would write in a notebook. Remove filler ("ok so", "I think I need to"), but keep their wording.
- **Task state:** only set `"state": "completed"` for things the user says are already done. Otherwise leave it out.
- **Signifiers:** add `"inspiration"` only for ideas the user is excited about or calls an idea. Priority is handled in step 5, so only add `"priority"` here if the user explicitly marks something as most important.
- **Nesting:** use `"depth": 1` for a sub-item that clearly belongs to the bullet above it. Most bullets are depth 0.
- **Don't ask about mood, sleep, gratitude, or events.** If the user mentions them, they become bullets like anything else.
- **Skip duplicates:** before step 6, run `dibujo log show --json` for today and leave out anything already in `data.bullets`, or already being migrated. Tell the user what you skipped.
- Don't put `#priority` or `#inspiration` in the text, don't start the text with `[ ]`, and don't put `⏳`, `^id`, or `[[links]]` at the end. Use the fields instead.

### 5. Priority

Ask once: **"Anything that matters most today?"** If they say "no" or "skip", go to step 6.

Add `priority` only to the bullets the user names:

- a brain-dump bullet: add `"priority"` to its `signifiers`;
- a task being migrated: add `--priority` to its `task migrate` command.

### 6. Confirm

Show the whole plan in one message, yesterday's changes first, then today's new bullets:

```
Yesterday (2026-11-09)
   > call the bank          → today
     > find card number     → today
   < renew passport         → 2026-12-01
   ~ old plan               (cancelled)
   × send invoice           (done)
   • water plants           (left open)

Today (2026-11-10)
*  • call the bank          (migrated)
     • find card number     (migrated)
   ○ dentist at 3pm
   – slept badly
!  – weekly review on sundays
```

Symbols: `•` open task, `×` completed, `>` migrated, `<` scheduled, `~` cancelled, `○` event, `–` note. In the margin: `*` priority, `!` inspiration.

Ask the user to confirm or edit. Apply any edits and show the plan again if anything changed. **Don't save until the user confirms.** If every step was skipped or left as it was, say there's nothing to save, and stop.

### 7. Save

Run the commands in this order, one at a time, reading each JSON result:

1. `dibujo task set` and `dibujo task schedule`, for each task the user completed, cancelled, or scheduled.
2. `dibujo task migrate <ref> [--priority] --json`, for each migrated task. Run it for the parent only. Its children move with it.
3. The brain-dump, if there is one. `raw` is the user's brain-dump text exactly as they wrote it. Pass the JSON on stdin with a **quoted heredoc** (`<<'DIBUJO_EOF'`, with the quotes), so quotes, `$`, and backticks in the user's text reach dibujo unchanged:

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
| `NOTE_CHANGED` | The note was edited while saving. Run the **same command again once**, with the same ref. Migration is safe to rerun: it finishes what's missing and never duplicates. |
| `TASK_NOT_FOUND` | The note changed since step 2. Run `dibujo task review --json` again, find the same task by its text and children, and retry once with its new `ref`. If you can't find it, report it as not saved. |
| `INVALID_INPUT` | Your capture JSON was wrong. Fix it using `error.message` and retry. Don't show the user the raw JSON unless they ask. |
| Anything else | Don't retry. Note `error.message` and `error.hint` for the report, and carry on with the next command. |

### 8. Report

Tell the user, briefly, what was saved and what wasn't, task by task:

- `task set` / `task schedule`: `data.status` is `updated` (saved) or `unchanged` (already that way).
- `task migrate`: `data.status` is `migrated` (saved, `data.copied` bullets added to today) or `unchanged` (already migrated).
- `log add`: `data.status` is `created` or `updated` (saved `data.added` bullets to `data.path`) or `unchanged` (already logged).

For anything that failed, say clearly that it was **not saved**, and show `error.message` and `error.hint`.
