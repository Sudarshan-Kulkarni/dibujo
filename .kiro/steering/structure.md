# Project structure

```
dibujo/
├── .kiro/steering/          # steering files (this folder)
├── skills/                  # agent skills, one folder per skill
│   ├── daily-log/
│   │   └── SKILL.md
│   ├── reflect/
│   │   └── SKILL.md
│   ├── migrate/
│   │   └── SKILL.md
│   └── review/
│       └── SKILL.md
├── docs/
│   └── vault-format.md      # single source of truth for note format and bullet syntax
├── src/
│   ├── cli/                 # commander entry point (index.ts, has the shebang) + one file per command
│   ├── bujo/                # pure logic: bullet parsing/formatting, signifiers, migration rules
│   ├── vault/               # filesystem layer: note paths, read/write, frontmatter
│   ├── notify/              # notification channels (Discord, etc.)
│   └── config.ts            # config file + env loading and validation (zod)
├── tests/                   # vitest tests, mirroring src/ paths
├── dist/                    # build output (gitignored, published)
├── .env.example
├── biome.json
├── package.json
└── tsconfig.json
```

`dist/`, `skills/`, and `docs/` are published to npm. `src/` and `tests/` are not.

## Skills

- Each skill follows the Agent Skills format: a folder containing `SKILL.md`, with YAML frontmatter that has `name` and `description`. Optional `references/` subfolders hold longer material.
- The skill folder name matches its `name` in kebab-case.
- `description` says what the skill does and when to use it, because agents use it to decide when to load the skill.
- Skills call the installed CLI (`dibujo <command> --json`) instead of editing vault files by hand. If a skill needs a vault operation that has no CLI command, add the command. Never reference repo-only commands like `npm run dev` in a skill.
- Skills point to the note format reference instead of restating it, so the format is defined in one place. Because skills get installed outside the repo, `dibujo skills install` also copies `docs/vault-format.md` to where installed skills can read it.
- `skills/` is the source. Users install the skills with `dibujo skills install [--target <dir>]`, which copies them into an agent's skills directory (for example `~/.kiro/skills/`). The copy records the package version, so a later install can detect and update outdated skills. Copying is required because the npx cache is temporary, so symlinks into it would break.
- When developing in this repo, symlink `skills/*` into `.kiro/skills/` so edits take effect immediately.

## Source code

- Dependencies point one way: `cli` → `vault` / `notify` → `bujo`. `bujo/` has no filesystem or network access.
- One CLI command per file in `src/cli/`, named after the command (e.g. `open-tasks.ts`).
- File names are kebab-case. Types and interfaces are PascalCase. Functions and variables are camelCase.
- Prefer named exports. Don't use default exports.
- Tests go in `tests/` and mirror the source path: `src/bujo/parse.ts` → `tests/bujo/parse.test.ts`.
