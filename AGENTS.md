This repository provides Preechak AI (`preechak-ai`), an Electron-based real‑time assistant which captures screen and audio
for contextual AI responses. The code is JavaScript and uses Electron Forge for
packaging.

## Getting started

Install dependencies and run the development app:

```
1. npm install
2. npm start
```

## Style

Run `npx prettier --write .` before committing. Prettier uses the settings in
`.prettierrc` (four-space indentation, print width 150, semicolons and single
quotes). `src/assets` and `node_modules` are ignored via `.prettierignore`.
The project does not provide linting; `npm run lint` simply prints
"No linting configured".

## Code standards

Development is gradually migrating toward a TypeScript/React codebase inspired by the
[transcriber](https://github.com/Gatecrashah/transcriber) project. Keep the following
rules in mind as new files are created:

- **TypeScript strict mode** – avoid `any` and prefer explicit interfaces.
- **React components** should be functional with hooks and wrapped in error
  boundaries where appropriate.
- **Secure IPC** – validate and sanitize all parameters crossing the renderer/main
  boundary.
- **Non‑blocking audio** – heavy processing must stay off the UI thread.
- **Tests** – always write relevant unit tests for any new feature implemented, and create or modify unit tests when resolving bugs.

## Shadcn and Electron

The interface is being rebuilt with [shadcn/ui](https://ui.shadcn.com) components.
Follow these guidelines when working on UI code:

- **Component directory** – place generated files under `src/components/ui` and export them from that folder.
- **Add components with the CLI** – run `npx shadcn@latest add <component>`; never hand-roll components.
- **Component pattern** – use `React.forwardRef` with the `cn()` helper for class names.
- **Path aliases** – import modules from `src` using the `@/` prefix.
- **React 19 + Compiler** – target React 19 with the new compiler when available.
- **Context isolation** – maintain Electron's context isolation pattern for IPC.
- **TypeScript strict mode** – run `npm run typecheck` before claiming work complete.
- **Tailwind theming** – rely on CSS variables and utilities in `@/utils/tailwind` for styling.
- **Testing without running** – confirm `npm run typecheck` and module resolution with `node -e "require('<file>')"`.

## Tests

- **New Features** – Always write relevant unit tests for any new feature implemented.
- **Bug Fixes** – Always add or modify unit tests covering the bug fix to prevent regressions.
- **Execution** – Run tests and at minimum ensure `npm install` and `npm start` work after changes.

## Merging upstream PRs

Pull requests from the upstream project are commonly
cherry‑picked here. When merging:

1. Inspect the diff and keep commit messages short (`feat:` / `fix:` etc.).
2. After merging, run the application locally to verify it still builds and
   functions.

## Audio processing principles

When implementing transcription features borrow the following rules from
`transcriber`:

- **16 kHz compatibility** – resample all audio before sending to whisper.cpp.
- **Dual‑stream architecture** – capture microphone and system audio on separate
  channels.
- **Speaker diarization** – integrate tinydiarize (`--tinydiarize` flag) for mono
  audio and parse `[SPEAKER_TURN]` markers to label speakers (Speaker A, B, C…).
- **Voice activity detection** – pre‑filter silent segments to improve speed.
- **Quality preservation** – keep sample fidelity and avoid blocking the UI
  during heavy processing.
- **Memory efficiency** – stream large audio files instead of loading them all at
  once.
- **Error recovery** – handle audio device failures gracefully.

## Privacy by design

- **Local processing** – transcriptions should happen locally whenever possible.
- **User control** – provide clear options for data retention and deletion.
- **Transparency** – document what is stored and where.
- **Minimal data** – only persist what is required for functionality.

## LLM plans

There are placeholder files for future LLM integration (e.g. Qwen models via
`llama.cpp`). Continue development after the core transcription pipeline is
stable and ensure tests cover this new functionality.

## Documentation Guidelines

When implementing a new feature or resolving a bug:

- **Check existing documentation** – Inspect the `documents/` folder to see if an existing file covers the relevant feature or bug.
- **Update existing documents** – If a relevant file exists, modify it to document what was done and how the system works.
- **Create new documents when needed** – If no relevant file exists, create a new `.md` file in `documents/` with a concise name of at most 2 words joined by a hyphen (e.g. `word1.md` for single words or `word1-word2.md` for two words).

## Pre-Execution Communication Guidelines

Before making modifications or executing changes, you must always provide the following upfront communication and **always ask for confirmation before you implement (non-negotiable)**:

### 1. For Bugs & Fixes

Before applying any fixes, always explain:

- **Findings**: What was identified as the root cause or issue.
- **Action Plan**: What specific steps you will take to resolve it.
- **Testing**: What unit tests will be added or modified to verify the fix and prevent regressions.

### 2. For New Features & Implementations

Before implementing any new feature, task, or requested changes, always explain:

- **Plan**: Your overall strategy and approach for the implementation.
- **Action Steps**: What concrete changes and steps you will carry out.
- **Testing**: What relevant unit tests will be written to cover the new feature.

### 3. Confirmation Required

- **Always ask for confirmation before you implement (non-negotiable)**: Wait for explicit user confirmation before modifying code or executing changes.
