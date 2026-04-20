# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-04-20

Major release: dual-shell UI model. The IDE now ships with two top-level
shells that share the same main-process backend (sessions, threads, PTY,
hooks, config). Toggle between them via `Ctrl+Alt+I`, the View menu, or
Settings → Immersive chat mode.

### Added
- **Chat-only shell** (Wave 42): single-column immersive chat interface modelled
  on Claude desktop, Codex, and piebald.ai. Mounts `AgentChatWorkspace` full-width
  with a minimal title bar, off-canvas session drawer, minimal status bar, and
  full-screen `DiffReviewPanel` overlay. Pop-out chat windows (`?mode=chat`)
  route to this shell automatically.
- `layout.immersiveChat` config flag; keyboard shortcut `Ctrl+Alt+I`;
  Settings entry; dynamic "Switch to / Exit Chat Mode" View menu item.
- `useImmersiveChatFlag` hook; `ChatOnlyShellWrapper` provider stack;
  hoisted `TOGGLE_IMMERSIVE_CHAT_EVENT` + `TOGGLE_SESSION_DRAWER_EVENT`
  constants in `appEventNames.ts`.
- Lazy config store (`configStoreLazy`) with preflight sanitization
  (`configPreflight`) for startup reliability under worker-thread contention
  and transient schema-mismatch states.

### Changed
- `IdeToolBridge` is intentionally not mounted in the chat-only shell.
  IDE-context tool queries (`getOpenFiles`, `getActiveFile`, `getSelection`,
  `getUnsavedContent`, `getTerminalOutput`) return empty — matches Claude
  desktop's behaviour. Option for cross-window delegation is deferred.
- `AutoSyncWatcher.triggerReindex` routes through `getIndexingWorkerClient()`
  singleton to avoid SQLite WAL-lock contention with initial-index workers
  that previously froze the UI for 20–30s.
- `handleActive` IPC handler falls back to `windowManager.getWindow(id)?.
  activeSessionId` when the renderer hasn't explicitly called `sessionCrud:
  activate`. Fixes session-bound actions for freshly-opened windows.
- `preload.ts` fans out `config:externalChange` through a single underlying
  `ipcRenderer.on` listener with a subscriber set, avoiding EventEmitter's
  default-cap warning at 11 subscribers.
- `optimizeDeps.force` in dev is now opt-in via `FORCE_OPTIMIZE_DEPS=1`
  (was always-on). Saves 20–30s on dev cold starts.
- `graphWorker` entry renamed to `indexingWorker` in electron-vite config
  to match the source module name.

### Fixed
- `EdgeDropZones` now gates pointer events on `useDndContext().active` —
  invisible edge zones no longer swallow all clicks/hovers/keyboard-focus
  routing when no drag is in flight.
- Worker-thread safety: `agentChatThreadStore` and its path constants are
  now lazy / gated by `isMainThread`, so worker threads that transitively
  import the module no longer crash on module load.
- `ThreadStoreSqliteRuntime.initSchema` always runs column migrations
  (idempotent via `hasCol`). Repairs DBs that were left in a half-migrated
  state by a prior broken migration condition.
- `indexingPipeline.ts` and `settingsEntries.ts` split along natural
  seams to satisfy `max-lines:300` without `eslint-disable` directives.

### Removed
- Two `eslint-disable max-lines` directives that were added as a short-term
  workaround. Both underlying files have been properly split.

## [1.0.1] - 2026-03-23

### Fixed
- **Packaging**: Add better-sqlite3 to asarUnpack (prevents launch crash on all platforms)
- **Packaging**: Add @electron/rebuild to devDeps with node-pty in rebuild scope
- **Packaging**: Set actual GitHub repo in electron-updater publish config
- **Security**: Remove web access token from stdout logging
- **Security**: Replace blocking execSync(taskkill) with async exec (eliminates 5s UI freeze on Windows)
- **Security**: Convert synchronous file read to async in IDE tool handler hot path
- **Security**: Add 10s timeout to OAuth token refresh fetch (prevents indefinite hang)
- **Security**: Restrict CSP connect-src to specific port in production builds
- **Stability**: Add top-level React error boundary with reload fallback
- **Stability**: Add SIGTERM/SIGINT handlers for graceful POSIX shutdown
- **Stability**: Cache OAuth credentials in memory (eliminates repeated disk reads)
- **Stability**: Cache SPA index.html at server startup (eliminates per-request sync read)
- **Stability**: Replace sleepSync with async delay in approval retry loop
- **Stability**: Add 15s fetch timeouts to extension/MCP marketplace handlers
- **Stability**: Consolidate electron-updater into singleton module
- **Stability**: Configure electron.crashReporter for local crash dump collection
- **Stability**: Fix React HMR double-createRoot warning
- **Accessibility**: Add keyboard access to AgentChat plan block expand/collapse
- **Accessibility**: Add keyboard access to blame gutter annotation rows
- **Accessibility**: Add aria-live to streaming chat messages for screen readers
- **UI**: Auto-detect system light/dark theme preference on first launch
- **UI**: Replace empty Suspense fallback with visible loading state
- **UI**: Replace alert() about dialog with custom event dispatch
- **Tests**: Fix all 35 pre-existing test failures (native module ABI, stale assertions, DB cleanup)
- **Tests**: Add 216 new tests (pathSecurity, gitDiffParser, importGraphAnalyzer, languageStrategies, chatOrchestrationBridgeGit)

### Changed
- Restore original ESLint thresholds (max-lines:300, max-lines-per-function:40) by splitting 17 oversized files
- Remove unused `streamdown` and `marked` dependencies
- Move @types/express, @types/ws to devDependencies
- Move react, react-dom to dependencies
- Replace `marked` usage with `react-markdown` in ExtensionStoreSection
- Replace `any` types in configSchema with `Record<string, unknown>`
- Update vitest include pattern to support .tsx test files
- Add `no-console` lint rule (warn level)

### Added
- MIT LICENSE file
- README.md with project overview and quick start
- CHANGELOG.md
- CONTRIBUTING.md with dev setup and coding conventions
- SECURITY.md with disclosure policy
- GitHub Actions CI workflow (typecheck, lint, test, build)
- GitHub issue templates and PR template
- .env.example documenting environment variables
- ai/deferred.md for tracking post-v1.0 features
- TODO-v1.1.md with all deferred audit items
- `clean` script in package.json
- `engines` field requiring Node >= 20, npm >= 9

### Removed
- 1,169 lines of duplicate content from 32 subsystem CLAUDE.md files
- Stale @types/marked (marked v17 ships its own types)

## [1.0.0-rc.1] - 2026-03-23

### Added
- Agent Chat with multi-turn Claude Code conversations and full IDE context injection
- Terminal management with shell integration, command block detection, and OSC 133 support
- File explorer with virtual tree, git status indicators, staging area, and inline editing
- Monaco-based code editor with syntax highlighting, vim mode, diff view, and minimap
- Agent Monitor for real-time session visibility, tool call timeline, and cost tracking
- Context Layer pipeline for automatic code intelligence and context enrichment
- Multi-provider orchestration (Claude Code CLI, Codex CLI)
- Web remote access via WebSocket bridge (Tailscale, Cloudflare Tunnel, LAN)
- 7 built-in themes (retro, modern, warp, cursor, kiro, light, high-contrast) plus custom theme editor
- Command palette with fuzzy search, file picker, and symbol search
- Session replay for reviewing past agent conversations
- Multi-session launcher for parallel agent workflows
- Settings panel with 16 configuration tabs and full-text search
- Git panel with branch selection, staging, and commit
- Time travel for exploring file change history
- Usage and cost analytics dashboard
- MCP server management and marketplace
- Extension store with VS Code marketplace integration
- CLAUDE.md auto-generation for project context
