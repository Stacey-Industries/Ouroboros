# Ouroboros IDE

An agent-focused desktop IDE built for agentic AI workflows. Launch, monitor, and interact with Claude Code sessions in a rich development environment.

Built with Electron, React, TypeScript, and Monaco Editor.

![Screenshot](docs/assets/screenshot.png)

## Features

- **Agent Chat** — Multi-turn conversations with Claude Code, with full IDE context injection
- **Terminal Management** — Multiple terminal sessions with shell integration and command block detection
- **File Explorer** — Virtual tree with git status, staging area, and inline editing
- **Monaco Editor** — Full-featured code editing with syntax highlighting, vim mode, and diff view
- **Agent Monitor** — Real-time visibility into agent sessions, tool calls, and cost tracking
- **Context Layer** — Automatic code intelligence that enriches agent context with relevant files
- **Multi-Provider** — Support for Claude Code CLI and Codex CLI orchestration
- **Web Remote Access** — Access the IDE from any browser via WebSocket bridge
- **Theming** — 7 built-in themes (dark, light, high-contrast) plus custom theme editor

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 9.0.0
- **Git**

## Quick Start

```bash
git clone https://github.com/colesam/agent-ide.git
cd agent-ide
npm install
npm run dev
```

## Build

```bash
npm run build        # Production build (electron-vite)
npm run dist         # Build + package with electron-builder
npm run build:web    # Web deployment build
```

## Development

```bash
npm run dev          # Start dev server + Electron with hot reload
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run test         # Run tests (vitest)
npm run validate     # Full validation (typecheck + format + lint + test)
```

## Architecture

Ouroboros uses a three-process Electron architecture:

- **Main Process** (`src/main/`) — Node.js: IPC handlers, PTY sessions, file operations, hooks server, AI orchestration
- **Preload** (`src/preload/`) — contextBridge: typed `window.electronAPI` surface
- **Renderer** (`src/renderer/`) — React: UI components, state management, Monaco editor

For detailed architecture documentation, see [`docs/architecture.md`](docs/architecture.md).

For a comprehensive feature walkthrough, see the [Beginner's Guide](docs/guides/complete-beginners-guide.md).

## Project Structure

```
src/
  main/           # Electron main process
    agentChat/    # Chat orchestration and persistence
    orchestration/# Context preparation and provider adapters
    ipc-handlers/ # IPC channel handlers
    web/          # Web remote access server
  preload/        # contextBridge (typed API surface)
  renderer/       # React renderer
    components/   # Feature folders (Layout, Terminal, FileTree, FileViewer, AgentChat, ...)
    hooks/        # Shared React hooks
    contexts/     # React contexts
    themes/       # Theme definitions
  shared/         # Cross-process shared code
  web/            # Web deployment preload shim
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
