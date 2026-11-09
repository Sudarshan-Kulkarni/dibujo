# dibujo

A digital companion to a paper Bullet Journal. You tell an AI agent what's on your mind, and dibujo turns it into short Bullet Journal bullets in your Obsidian vault. The notebook stays your main journal. dibujo keeps a searchable archive next to it.

It has two parts:

- **Agent skills** (Markdown) that guide an agent through Bullet Journal rituals.
- **The `dibujo` CLI**, which the skills call to read and write vault notes.

## Install

Requires Node.js 22.12 or later.

```sh
npm install -g digi-bujo
```

The npm package is `digi-bujo`, and the command it installs is `dibujo`.

## Set up

```sh
dibujo init                # asks for your vault path, notes folder, and day-start hour
dibujo skills install      # installs the skills into ~/.kiro/skills/
```

Then ask your agent to log your day.

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
