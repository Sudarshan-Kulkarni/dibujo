# Project structure

```
dibujo/
├── .kiro/steering/          # steering files (this folder)
├── .kiro/specs/             # feature specs (requirements, design, tasks)
├── .kiro/skills/            # dev install of skills/ (gitignored, written by `skills install`)
├── skills/                  # agent skills, one folder per skill
│   ├── daily-log/
│   │   └── SKILL.md
│   └── morning-planning/
│       └── SKILL.md         # later: reflect/, migrate/, review/
├── docs/
│   └── vault-format.md      # single source of truth for note format and bullet syntax
├── src/
│   ├── cli/                 # index.ts (shebang), program.ts, context.ts, output.ts, one file per command (log-*, task-*, future-*)
│   ├── bujo/                # pure logic: bullets and task fields, capture schema, note sections, refs,
│   │                        #   line edits (edit.ts), migration planning (migrate.ts), future log notes (future.ts), journal date
│   ├── vault/               # filesystem layer: safe paths, atomic writes, daily notes, task operations (tasks.ts),
│   │                        #   future log operations (future.ts), ordered multi-note writes (write-plan.ts), block ids (block-id.ts)
│   ├── skills/              # harness table and skill installer
│   ├── notify/              # later: notification channels (Discord, etc.)
│   ├── config.ts            # config file + env loading and validation (zod)
│   ├── errors.ts            # DibujoError, error codes, exit codes
│   └── package-info.ts      # finds the package root and version
├── tests/                   # vitest tests, mirroring src/ paths
├── dist/                    # build output (gitignored, published)
├── .env.example
├── biome.json
├── package.json
├── tsconfig.json            # type checking (src + tests)
└── tsconfig.build.json      # build (src only → dist)
```

`dist/`, `skills/`, and `docs/` are published to npm. `src/` and `tests/` are not.

## Skills

- Each skill follows the Agent Skills format: a folder containing `SKILL.md`, with YAML frontmatter that has only `name` and `description`. Don't use harness-specific frontmatter, so the same files work in any harness. Optional subfolders hold longer material.
- The skill folder name matches its `name` in kebab-case.
- `description` says what the skill does and when to use it, because agents use it to decide when to load the skill.
- Skills call the installed CLI (`dibujo <command> --json`) instead of editing vault files by hand. If a skill needs a vault operation that has no CLI command, add the command. Never reference repo-only commands like `npm run dev` in a skill.
- Skills link to `references/vault-format.md` instead of restating the format. Don't create that file in `skills/`: `dibujo skills install` copies `docs/vault-format.md` into each installed skill's `references/` folder.
- `skills/` is the source. Users install the skills with `dibujo skills install [--harness <name> | --target <dir>]`, which copies them into an agent's skills folder (default: Kiro, `~/.kiro/skills/`). Each installed skill gets a `.dibujo.json` marker with the package version and a content hash, so later installs can update it and won't touch folders dibujo didn't create. Copying is required because the npx cache is temporary, so symlinks into it would break.
- Supported harnesses are listed in `src/skills/harnesses.ts`. Adding a harness means adding an entry there.
- When developing in this repo, run `npm run dev -- skills install --target .kiro/skills` after editing a skill or `docs/vault-format.md`. The content hash means edits are picked up without a version bump. Don't symlink skills, because symlinked skills would lack `references/vault-format.md`.

## Source code

- Dependencies point one way: `cli` → `vault` / `skills` / `config` → `bujo`. `bujo/` has no filesystem or network access.
- Commands get everything from the outside world (env, clock, stdin, stdout, home folder) through the `Ctx` in `src/cli/context.ts`, never from `process` directly, so tests can pass a fake context.
- Expected failures throw `DibujoError` with a code from `src/errors.ts`. Add a new code there rather than throwing plain errors for things a user or skill can act on.
- One CLI command per file in `src/cli/`, named after the command (e.g. `log-add.ts`). Register new commands in `src/cli/registers.ts`.
- Notes live under `<vault>/<folder>/`: daily notes at `Daily/YYYY-MM-DD.md` and future log notes (one per year) at `Future/YYYY.md`.
- Every vault path goes through `resolveInVault` in `src/vault/paths.ts`. Every vault write goes through `src/vault/atomic-write.ts`.
- File names are kebab-case. Types and interfaces are PascalCase. Functions and variables are camelCase.
- Prefer named exports. Don't use default exports.
- Tests go in `tests/` and mirror the source path: `src/bujo/note.ts` → `tests/bujo/note.test.ts`. Shared test helpers live in `tests/helpers/`.
