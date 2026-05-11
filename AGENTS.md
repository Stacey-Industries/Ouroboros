# Repository Guidelines

## Project Structure & Module Organization

Ouroboros is an Electron/Vite TypeScript app. Core source lives in `src/`:
`src/main/` contains the Electron main process, IPC, config, hooks, PTY, and AI orchestration; `src/preload/` exposes the typed `window.electronAPI` bridge; `src/renderer/` contains React UI, state, styles, and components; `src/shared/` holds cross-process types; `src/web/` supports web/mobile builds. End-to-end tests live in `e2e/`; unit and component tests are colocated as `*.test.ts` or `*.test.tsx`. Static assets are in `assets/`, `public/`, and `build-resources/`. Longer design notes are in `docs/`, with subsystem guidance in local `CLAUDE.md` files.

## Build, Test, and Development Commands

- `npm run dev`: start Electron with Vite hot reload.
- `npm run build`: create the Electron production build.
- `npm run typecheck`: run both web and Node TypeScript projects.
- `npm run lint` / `npm run lint:fix`: run ESLint, optionally fixing issues.
- `npm run format:check` / `npm run format`: verify or apply Prettier formatting.
- `npm run test`: run Vitest. Use `npm run test:coverage` for coverage output.
- `npm run test:e2e`: run Playwright Electron tests.
- `npm run validate`: full local gate: typecheck, format check, lint, and unit tests.

## Coding Style & Naming Conventions

Use TypeScript with strict typing; avoid `any` unless documented inline. Follow `.editorconfig`: 2-space indentation, LF endings, UTF-8, and final newlines. Prettier uses semicolons, single quotes in TS, double quotes in JSX, trailing commas, and a 100-column width. ESLint enforces sorted imports, React hooks rules, `max-lines` 300, `max-lines-per-function` 40, complexity 10, and depth 3. Split large React features into focused files such as `.parts.tsx`, `.model.ts`, or smaller hooks.

## Testing Guidelines

Prefer focused colocated Vitest tests for changed logic and React behavior. Use `*.test.ts(x)` for unit/component tests and `*.spec.ts` for Playwright scenarios under `e2e/`. Run the smallest relevant test first, then `npm run validate` for broad changes.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit style such as `fix(chat): ...`, `chore(settings): ...`, and `release: ...`; automated checkpoint commits may use `[ouroboros-checkpoint] ...`. Keep commits scoped. PRs should include the problem, solution summary, validation run, linked issue when available, and screenshots or recordings for UI changes.

## Agent-Specific Instructions

Do not kill Electron processes to reset state; this repository may be running inside its own Electron host. Do not relax lint rules or bypass validation unless explicitly approved.
