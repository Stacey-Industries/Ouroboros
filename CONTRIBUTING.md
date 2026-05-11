<!-- this is a test - to be removed -->
# Contributing to Ouroboros

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 9.0.0
- **Git**

## Development Setup

```bash
git clone https://github.com/colesam/agent-ide.git
cd agent-ide
npm install
npm run dev
```

## Project Structure

Ouroboros uses a three-process Electron architecture:

- `src/main/` — Node.js main process (IPC, PTY, hooks, config, AI orchestration)
- `src/preload/` — contextBridge (typed `window.electronAPI` surface)
- `src/renderer/` — React renderer (UI components, state, Monaco editor)
- `src/shared/` — Cross-process shared code
- `src/web/` — Web deployment preload shim

Each subsystem directory contains its own `CLAUDE.md` with architecture details, patterns, and gotchas.

## Development Workflow

```bash
npm run dev          # Start dev server + Electron with hot reload
npm run typecheck    # TypeScript type checking (both configs)
npm run lint         # ESLint
npm run test         # Run tests (vitest)
npm run validate     # Full validation: typecheck + format + lint + test
```

## Coding Conventions

- **TypeScript strict mode** — zero `any` unless justified with an inline comment
- **IPC response pattern** — all handlers return `{ success: true, ...data }` or `{ success: false, error: string }`
- **Styling** — Tailwind utilities + CSS custom properties. Never hardcode colors
- **Component organization** — feature folders with barrel exports. Large components split into `.parts.tsx`, `.model.ts`, `.view.tsx`
- **Two event systems** — Electron IPC (via preload bridge) vs DOM CustomEvents (renderer-only). Never mix them
- **ESLint rules** — `max-lines: 700` (ratcheting to 300), `complexity: 10`, `max-depth: 3`, `max-params: 4`

## Important Warnings

- **NEVER relax lint rules to pass commits** — use `--no-verify` only as a last resort
- **`npm run build` writes to `out/`, but already-running processes (e.g., the codemode-proxy MCP subprocess for `ouroboros`) keep using the previously-loaded code in memory.** Restart the parent that forked the subprocess (typically the Claude Code session) to pick up rebuilt code.

## Pull Request Process

1. Create a feature branch from `master`
2. Run `npm run validate` before pushing
3. Open a PR with a clear description
4. Ensure CI passes (typecheck, lint, test, build)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
