# Tech stack

## Runtime and language

- **TypeScript** on **Node.js**, with ESM modules only (`"type": "module"`). Support Node `>=22` (set `engines.node` in `package.json`).
- **npm** as the package manager.
- `tsconfig` uses `strict: true`, `module` / `moduleResolution: "NodeNext"`, and `outDir: "dist"`. Relative imports use `.js` extensions (`import { x } from "./parse.js"`), as NodeNext requires.
- Don't use `any`; prefer `unknown` and narrow it.
- **tsx** runs TypeScript directly during development only. The published package runs compiled JavaScript from `dist/` and never depends on tsx at runtime.

## Packaging and distribution

dibujo ships as an npm package that runs with `npx`.

- Package name: `digi-bujo` (unscoped). The bin name is `dibujo`, and the project is still called dibujo everywhere else.
- `package.json`:
  - `"bin": { "dibujo": "./dist/cli/index.js" }`. The entry file starts with `#!/usr/bin/env node`.
  - `"files": ["dist", "skills", "docs"]`. Only these get published. Check with `npm pack --dry-run`.
  - Runtime libraries go in `dependencies`. Build, lint, and test tools go in `devDependencies`. Keep runtime dependencies few, because `npx` installs them on first run.
  - `prepublishOnly` runs `check`, `test`, and `build`.
- Usage:
  - One-off: `npx -y digi-bujo <command>`
  - Daily use and scheduled jobs: `npm install -g digi-bujo`, then `dibujo <command>`. This avoids npx startup time on every reminder.
- Follow semver. Changing CLI flags, `--json` output shapes, or the vault format is a breaking change, because installed skills depend on them.

## Libraries

Add new dependencies only when they are clearly needed, and prefer these:

| Purpose | Library |
| --- | --- |
| CLI commands and args | `commander` |
| Frontmatter parsing and writing | `gray-matter` |
| Validation of config, frontmatter, and CLI input | `zod` |
| Dates (daily, monthly, and future log keys) | `date-fns` |
| Notifications (when decided) | Discord webhook via `fetch`; `discord.js` only if a two-way bot is needed |
| Tests (dev) | `vitest` |
| Lint and format (dev) | `biome` |
| Dev runner (dev) | `tsx` |

## Commands

- `npm install`: install dependencies
- `npm run dev -- <command> [args]`: run the CLI from source with tsx
- `npm run build`: compile to `dist/` with `tsc`
- `npm link`: put a local `dibujo` on PATH to test the built bin
- `npm test`: run tests once (`vitest --run`). Never use watch mode in agent sessions.
- `npm run check`: Biome lint/format check plus `tsc --noEmit`
- `npm run format`: apply Biome fixes
- `npm pack --dry-run`: check what will be published

## Configuration and secrets

- User config lives at `$XDG_CONFIG_HOME/dibujo/config.json` (default `~/.config/dibujo/config.json`). `dibujo init` creates it and asks for the vault path.
- Environment variables override the config file: `DIBUJO_VAULT_PATH`, `DIBUJO_DISCORD_WEBHOOK_URL`.
- Validate the config with zod at startup. On failure, print what is missing and how to fix it (e.g. "run `dibujo init`").
- Create the config file with `0600` permissions, because it can hold webhook URLs or tokens.
- Never hardcode vault paths. Never put secrets in the repo, the package, or logs.
- Never log full journal content. Log note paths and counts instead.
- For development in this repo, a gitignored `.env` (loaded via `--env-file` in the `dev` script) can set the same variables. Keep `.env.example` up to date with placeholder values.

## Engineering rules

- Scripts are deterministic and do no LLM calls. Interpretation (parsing raw thoughts, summarizing) belongs to the agent in skills. Scripts do the I/O and bookkeeping.
- Every CLI command that skills call supports `--json` output, so the agent can parse results reliably.
- Commands must never wait for input when stdin is not a TTY, or when `--json` is passed. Fail with a clear error instead, so agents and scheduled jobs don't hang.
- Exit codes: `0` on success, `1` on errors, `2` on invalid usage.
- File writes to the vault are atomic: write to a temp file, then rename. Never truncate an existing note.
- Commands that change the vault support `--dry-run`.
- Keep pure logic (bullet parsing, date keys, migration rules) separate from filesystem code, so it is easy to unit test.

## Git

Commit messages use the format `<verb>: <description>`. The verb is lowercase and imperative. The description is short and lowercase, with no trailing period.

Examples:
- `add: spec files and scaffold repo`
- `fix: daily note path for dates near year boundary`
- `update: migration skill to prompt for dropped tasks`
- `remove: unused date helper`
