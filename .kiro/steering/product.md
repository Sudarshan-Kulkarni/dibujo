# Product: dibujo

dibujo is a personal digital companion to a physical Bullet Journal (the method by Ryder Carroll). The paper notebook stays the primary journal. dibujo handles the parts paper does badly: turning free-form writing into clean bullets, keeping a searchable archive, nudging the user to follow through, and summarizing patterns over months.

## Users

Each install serves a single person on their own machine. There is no multi-user support, auth, or hosting. dibujo is published to npm as a CLI that runs with `npx`, so anyone can install it, but the author is the primary user. Don't hardcode anything specific to the author's setup. Paths and channels come from config.

## How it works

- **Agent skills** (plain Markdown) guide an AI agent through Bullet Journal rituals: the daily log, reflection, monthly migration, and reviews.
- **Helper scripts** (a TypeScript CLI) do the deterministic work: reading and writing vault notes, parsing bullets, collecting open tasks, and sending reminders.
- **Storage** is an Obsidian vault, which is a folder of Markdown files. The vault is the source of truth. Scripts write to it directly on the filesystem, so Obsidian does not need to be running.

## Core features

1. **Stream-of-consciousness capture → bullets.** The user writes or dictates raw text. The agent turns it into short Bullet Journal bullets (tasks, events, notes) and writes them to the right daily note.
2. **Rituals.** Guided morning planning, evening reflection, and monthly migration of open tasks (migrate, schedule, or drop).
3. **Accountability.** Scheduled reminders about open or overdue tasks and missed rituals, delivered outside the terminal (Discord is the current candidate).
4. **Review and analysis.** Monthly and yearly summaries built from aggregated notes: recurring themes, task completion, and tasks that keep getting migrated.

## Principles

- Bullets are short and concise, in Bullet Journal style. Never pad or editorialize the user's words.
- Keep the user's original raw text alongside the parsed bullets, so nothing is lost if parsing gets something wrong.
- Vault notes must stay readable and editable by hand in Obsidian. No opaque data blobs.
- Never delete or overwrite user-written content in the vault. Append, or ask first.
- Personal journal data is private. Never send vault content to third-party services, except an LLM the user is already running, and short reminder text sent to the notification channel.

## Open decisions

These are not settled yet. Don't assume an answer; ask, or offer options with trade-offs.

- Notification channel and delivery: Discord webhook vs. Discord bot vs. alternatives such as ntfy.
- Scheduler: macOS launchd vs. cron vs. an in-process scheduler.
- The exact vault note format. Once it is defined, it lives in `docs/vault-format.md` and is the single source of truth for both skills and scripts.
