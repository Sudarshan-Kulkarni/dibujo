# dibujo

A digital companion to a paper Bullet Journal. You tell an AI agent what's on your mind, and dibujo turns it into short Bullet Journal bullets in your Obsidian vault. The notebook stays your main journal. dibujo keeps a searchable archive next to it.

It has two parts:

- **Agent skills** (Markdown) that guide an agent through Bullet Journal rituals.
- **The `dibujo` CLI**, which the skills call to read and write vault notes.

## Status

This is an early 0.x release. Commands, `--json` output, and the vault format can change between minor versions. The release notes, when they exist, will say so.

dibujo has been developed and tested on macOS with the Kiro agent. Other agents that load Agent Skills may work through `dibujo skills install --target <dir>`, but that is untested.

## What you need

- Node.js 22.12 or later.
- An Obsidian vault. It's a folder of Markdown files, and Obsidian doesn't need to be running.
- An AI agent that loads Agent Skills. Kiro is supported out of the box (`--harness kiro`, the default).

## Install

```sh
npm install -g digi-bujo
```

The npm package is `digi-bujo`, and the command it installs is `dibujo`.

## Set up

```sh
dibujo init                # asks for your vault path, notes folder, and day-start hour
dibujo skills install      # installs the skills into ~/.kiro/skills/
```

`dibujo init` flags:

- `--vault <path>`: your Obsidian vault.
- `--folder <name>`: the folder inside the vault for dibujo notes (default `Bujo`).
- `--day-start <hour>`: the hour (0-23) a new journal day starts (default `0`).
- `--flag-after-days <days>`: flag a task once it has been migrated this many days in a row (default `3`).

`dibujo skills install` flags:

- `--harness <name>`: the agent to install for (only `kiro` for now, and the default).
- `--target <dir>`: install into this folder instead of a harness's folder.
- `--dry-run`: show what would change without writing anything.

Run `dibujo skills install` again after you update dibujo to update the skills. `dibujo config` shows the active config and where each value comes from.

Then ask your agent to log your day.

If you used an earlier version that kept the future log in `Future/YYYY.md` notes, run `dibujo future import` once to copy their entries into `Future.md`.

## What you can ask your agent

| Skill | What it does | Try saying |
| --- | --- | --- |
| `daily-log` | Turns what you write into short bullets (tasks, events, notes) in a day's note. | "Log my day", "jot down what's on my mind" |
| `morning-planning` | Walks through yesterday's open tasks (migrate, schedule, cancel, complete, or leave), then the future log entries that are due, then a morning brain-dump. | "Plan my morning", "migrate yesterday's tasks" |
| `future-log` | Adds tasks, events, and notes to the future log, with a date if you have one, and reads or changes what's in it. | "Put the dentist on Dec 12 on my future log", "what's in my future log?" |

Each skill shows you what it plans to write and asks you to confirm before it saves.

## What it looks like in your vault

```
<vault>/Bujo/
├── Daily/
│   └── 2026-11-09.md
└── Future.md
```

`Bujo` is the default folder name. A daily note:

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

## Captures

> [!capture]- 08:42 · 3f9a1b2c
> ok so today I need to call the bank about the card, that's the
> big one. sent the invoice to Ana already. dentist at 3. slept
> badly again, too much phone before bed.
```

`## Log` holds the bullets. `## Captures` keeps your original words, so nothing is lost if a bullet was parsed wrongly. `Future.md`:

```markdown
---
dibujo: 1
type: future
---

- [ ] learn Rust
- [ ] book flights [[Bujo/Daily/2026-11-09#^q7r8s9|from 2026-11-09]] ⏳ 2026-12-20
* dentist at 3pm 📅 2026-12-12
- check out the zine fair in spring
```

See [docs/vault-format.md](docs/vault-format.md) for the full format.

## The future log

The future log holds things you can't do now.

- **Getting things in.** Schedule a task from a daily note, with a date or without one, or add entries directly (tasks, events, and notes).
- **Dated entries** come back in morning planning when the date arrives. You can bring them into today, give them another date, cancel them, or leave them. A due entry stays listed until you decide.
- **Undated entries** wait until you choose to look at the list. Morning planning offers a look, and you can ask for it any time.

## Using the CLI directly

| Command | What it does |
| --- | --- |
| `dibujo init` | Choose your vault and save the config. |
| `dibujo config` | Show the active config. |
| `dibujo log` | `show` a day's bullets, or `add` a capture. |
| `dibujo task` | `review` yesterday's open tasks, `set` a state, `schedule` a task, or `migrate` it. |
| `dibujo future` | `add`, `show`, `due`, `migrate`, `reschedule`, `cancel`, or `import`. |
| `dibujo skills` | `install` the agent skills. |

`dibujo <command> --help` has the details. `--json` prints machine-readable output. `--dry-run` previews writes on commands that change the vault.

## Obsidian notes

Nothing here is required. Notes work in plain Obsidian.

- Tasks with `>`, `<`, and `-` inside the checkbox are the alternative checkbox styles that themes like Minimal and the Tasks plugin show. Without them, Obsidian still shows a checkbox and the line stays readable.
- The `⏳` date follows the [Tasks plugin](https://publish.obsidian.md/tasks/) format.

**Warning:** Prettier (run on your vault) and Obsidian Linter (with the "list marker style" rule on) can rewrite every `*` to `-`, which turns all your events into notes. If you use them, exclude `<folder>/Daily` or turn off list-marker rewriting.

## Privacy

dibujo makes no network requests and sends nothing anywhere. Your notes stay in your vault. The agent you run can read whatever the skills send it, so what it does with that depends on the agent you use.

## Planned, not built yet

- Evening reflection.
- Monthly migration of open tasks.
- Reminders.
- Monthly and yearly reviews.

## Development

```sh
npm install
npm run dev -- --help      # run the CLI from source
npm test                   # run tests once
npm run check              # lint, format check, and type check
npm run build              # compile to dist/
```

## License

MIT
